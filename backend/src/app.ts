import { Elysia, t } from "elysia";
import { cors } from "@elysiajs/cors";
import { jwt } from "@elysiajs/jwt";
import { cookie } from "@elysiajs/cookie";
import { staticPlugin } from "@elysiajs/static";

import { config } from "./config";
import { registerWorkoutRoutes } from "./routes/workouts.routes";
import { registerAnalyticsRoutes } from "./routes/analytics.routes";
import { registerBodyweightRoutes } from "./routes/bodyweight.routes";
import { registerRestDayRoutes } from "./routes/rest-days.routes";
import { registerProfileRoutes } from "./routes/profile.routes.ts";
import {
  isPublicPath,
  authLoginBodySchema,
  getAuthVerifyResponse,
  handleAuthLogin,
  handleAuthLogout,
  requireAuthenticatedRequest,
} from "./services/auth.service.ts";

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

export function createApp() {
  const app = new Elysia()
    .use(
      staticPlugin({
        assets: "./public",
        prefix: "/",
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
    .get("/health", () => ({ status: "ok" }))
    // API routes under /api prefix
    .group("/api", (app) =>
      app
        .use(
          jwt({
            name: "jwt",
            secret: config.jwtSecret,
            exp: "7d",
          }),
        )
        .use(cookie())
        .post(
          "/auth/login",
          async ({ body, jwt, cookie: { auth } }) =>
            handleAuthLogin({
              body,
              jwt,
              auth,
            }),
          {
            body:
              authLoginBodySchema ??
              t.Object({
                password: t.String(),
              }),
          },
        )
        .post("/auth/logout", ({ cookie: { auth } }) => handleAuthLogout(auth))
        .get("/auth/verify", async ({ jwt, cookie: { auth } }) =>
          getAuthVerifyResponse({
            jwt,
            auth,
          }),
        )
        .onBeforeHandle(async ({ jwt, cookie: { auth }, path, set }) => {
          if (isPublicPath(path)) {
            return;
          }

          return requireAuthenticatedRequest({
            jwt,
            auth,
            set,
          });
        })
        .use((app) => {
          registerRoutes(
            app,
            registerWorkoutRoutes as RouteRegistrar<typeof app>,
            registerAnalyticsRoutes as RouteRegistrar<typeof app>,
            registerBodyweightRoutes as RouteRegistrar<typeof app>,
            registerRestDayRoutes as RouteRegistrar<typeof app>,
            registerProfileRoutes as RouteRegistrar<typeof app>,
          );
          return app;
        }),
    );

  return app;
}
