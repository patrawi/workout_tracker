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
import { registerHistoryRoutes } from "./routes/history.routes";
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

export function createApp(ctx: AppContext) {
  const { configService, authService } = ctx;

  const app = new Elysia()
    // Serve hashed assets (JS/CSS/images) with 1-year cache - filenames change when content changes
    .use(
      staticPlugin({
        assets: "./public/assets",
        prefix: "/assets",
        maxAge: 60 * 60 * 24 * 365, // 1 year
        directive: "immutable",
        etag: true,
        alwaysStatic: true,
      }),
    )
    // Serve root files (index.html, manifest, icons) with no cache
    .use(
      staticPlugin({
        assets: "./public",
        prefix: "/",
        maxAge: 0,
        etag: true,
        ignorePatterns: ["assets/**"],
      }),
    )
    .use(
      cors({
        credentials: true,
        origin: true,
      }),
    )
    // SPA fallback - serve index.html for client-side routes (no caching)
    .get("/", ({ set }) => {
      set.headers['Cache-Control'] = 'public, max-age=0, must-revalidate'
      return Bun.file("./public/index.html")
    })
    .get("/login", ({ set }) => {
      set.headers['Cache-Control'] = 'public, max-age=0, must-revalidate'
      return Bun.file("./public/index.html")
    })
    .get("/analytics", ({ set }) => {
      set.headers['Cache-Control'] = 'public, max-age=0, must-revalidate'
      return Bun.file("./public/index.html")
    })
    .get("/profile", ({ set }) => {
      set.headers['Cache-Control'] = 'public, max-age=0, must-revalidate'
      return Bun.file("./public/index.html")
    })
    .get("/history", ({ set }) => {
      set.headers['Cache-Control'] = 'public, max-age=0, must-revalidate'
      return Bun.file("./public/index.html")
    })
    .get("/history/*", ({ set }) => {
      set.headers['Cache-Control'] = 'public, max-age=0, must-revalidate'
      return Bun.file("./public/index.html")
    })
    .get("/nutrition", ({ set }) => {
      set.headers['Cache-Control'] = 'public, max-age=0, must-revalidate'
      return Bun.file("./public/index.html")
    })
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
            (a) => registerHistoryRoutes(a, ctx),
          );
          return app;
        }),
    );

  return app;
}
