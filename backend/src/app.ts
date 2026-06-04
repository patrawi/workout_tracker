import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { cookie } from "@elysiajs/cookie";
import { staticPlugin } from "@elysiajs/static";

import type { AppContext } from "./context";
import { registerWorkoutRoutes } from "./routes/workouts.routes";
import { registerAnalyticsRoutes } from "./routes/analytics.routes";
import { registerBodyweightRoutes } from "./routes/bodyweight.routes";
import { registerRestDayRoutes } from "./routes/rest-days.routes";
import { registerProfileRoutes } from "./routes/profile.routes";
import { registerNutritionRoutes } from "./routes/nutrition.routes";
import { registerWaterRoutes } from "./routes/water.routes";
import { registerFoodCatalogRoutes } from "./routes/food-catalog.routes";
import { registerHistoryRoutes } from "./routes/history.routes";
import { registerCoachRoutes } from "./routes/coach.routes";
import { notificationsRoutes } from "./routes/notifications";
import { cronRoutes } from "./routes/cron";

type RouteRegistrar<TApp> = (app: TApp) => unknown;

function registerRoutes<TApp>(
  app: TApp,
  ...registrars: Array<RouteRegistrar<TApp>>
): TApp {
  for (const registrar of registrars) {
    registrar(app);
  }

  return app;
}

// Content type by extension for hashed build assets (the `.br`/`.gz` variant
// keeps the original extension's type, e.g. index-abc.js.br → text/javascript).
const ASSET_TYPES: Record<string, string> = {
  js: "text/javascript; charset=utf-8",
  css: "text/css; charset=utf-8",
  svg: "image/svg+xml",
  json: "application/json; charset=utf-8",
  map: "application/json; charset=utf-8",
  woff2: "font/woff2",
  woff: "font/woff",
  png: "image/png",
  webp: "image/webp",
  ico: "image/x-icon",
};

// Serve a hashed asset, preferring a precompressed (.br/.gz) variant when the
// client accepts it. Immutable cache since filenames change with content.
async function serveAsset(rel: string | undefined, acceptEncoding: string): Promise<Response> {
  if (!rel || rel.includes("..")) return new Response("forbidden", { status: 403 });
  const base = `./public/assets/${rel}`;
  const ext = rel.slice(rel.lastIndexOf(".") + 1).toLowerCase();
  const headers: Record<string, string> = {
    "Content-Type": ASSET_TYPES[ext] ?? "application/octet-stream",
    "Cache-Control": "public, max-age=31536000, immutable",
    Vary: "Accept-Encoding",
  };

  if (acceptEncoding.includes("br")) {
    const br = Bun.file(`${base}.br`);
    if (await br.exists()) return new Response(br, { headers: { ...headers, "Content-Encoding": "br" } });
  }
  if (acceptEncoding.includes("gzip")) {
    const gz = Bun.file(`${base}.gz`);
    if (await gz.exists()) return new Response(gz, { headers: { ...headers, "Content-Encoding": "gzip" } });
  }
  const raw = Bun.file(base);
  if (await raw.exists()) return new Response(raw, { headers });
  return new Response("not found", { status: 404 });
}

export function createApp(ctx: AppContext) {
  const { configService, authService } = ctx;

  const app = new Elysia()
    // Serve hashed assets, preferring precompressed .br/.gz, with 1-year immutable cache
    .get("/assets/*", ({ params, request }) =>
      serveAsset((params as Record<string, string>)["*"], request.headers.get("accept-encoding") ?? ""),
    )
    // Serve root files (index.html, manifest, icons) with no cache
    .use(
      staticPlugin({
        assets: "./public",
        prefix: "/",
        maxAge: 0,
        etag: true,
        ignorePatterns: ["assets/**"],
        // Register concrete per-file routes so they win over the SPA `*` catch-all
        // (otherwise the wildcard shadows them and SW/manifest/icons 404).
        alwaysStatic: true,
      }),
    )
    .use(
      cors({
        credentials: true,
        origin: configService.allowedOrigins,
      }),
    )
    .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
    // Public routes (no auth required)
    .use(notificationsRoutes)
    .use(cronRoutes)
    // API routes under /api prefix
    .group("/api", (app) =>
      app
        .use(
          jwt({
            name: "jwt",
            secret: configService.jwtSecret,
            exp: "7d",
          }),
        )
        .use(cookie())
        .post(
          "/auth/login",
          async ({ body, jwt, cookie: { auth } }) =>
            authService.handleLogin(body as { password: string }, jwt, auth),
          {
            body:
              authService.authLoginBodySchema ??
              t.Object({
                password: t.String(),
              }),
          },
        )
        .post("/auth/logout", ({ cookie: { auth } }) => authService.handleLogout(auth))
        .get("/auth/verify", async ({ jwt, cookie: { auth } }) =>
          authService.handleVerify(jwt, auth),
        )
        .onBeforeHandle(async ({ jwt, cookie: { auth }, path, set }) => {
          if (authService.isPublicPath(path)) {
            return;
          }

          return authService.requireAuth(jwt, auth, set);
        })
        .use((app) => {
          registerRoutes(
            app,
            (a) => registerWorkoutRoutes(a, ctx),
            (a) => registerAnalyticsRoutes(a, ctx),
            (a) => registerBodyweightRoutes(a, ctx),
            (a) => registerRestDayRoutes(a, ctx),
            (a) => registerProfileRoutes(a, ctx),
            (a) => registerNutritionRoutes(a, ctx),
            (a) => registerWaterRoutes(a, ctx),
            (a) => registerFoodCatalogRoutes(a, ctx),
            (a) => registerHistoryRoutes(a, ctx),
            (a) => registerCoachRoutes(a, ctx),
          );
          return app;
        }),
    )
    // SPA fallback — serve index.html ONLY for top-level navigations so the
    // React router can handle the path. Unmatched asset / SW / fetch requests
    // (Accept != text/html) must 404, never receive HTML — otherwise the browser
    // gets HTML where it expected JS and the app white-screens. Registered last.
    .get("*", ({ path, request, set }) => {
      const accept = request.headers.get("accept") ?? "";
      if (path.startsWith("/api") || !accept.includes("text/html")) {
        set.status = 404;
        return { error: "Not found" };
      }
      set.headers["Cache-Control"] = "public, max-age=0, must-revalidate";
      return Bun.file("./public/index.html");
    });

  return app;
}
