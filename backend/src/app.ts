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
    .use(
      staticPlugin({
        assets: "./public",
        prefix: "/",
        maxAge: 0, // No caching so service worker updates are always detected
      }),
    )
    .use(
      cors({
        credentials: true,
        origin: true,
      }),
    )
    // SPA fallback - serve index.html for client-side routes
    .get("/", () => Bun.file("./public/index.html"))
    .get("/login", () => Bun.file("./public/index.html"))
    .get("/analytics", () => Bun.file("./public/index.html"))
    .get("/profile", () => Bun.file("./public/index.html"))
    .get("/history", () => Bun.file("./public/index.html"))
    .get("/history/*", () => Bun.file("./public/index.html"))
    .get("/nutrition", () => Bun.file("./public/index.html"))
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
