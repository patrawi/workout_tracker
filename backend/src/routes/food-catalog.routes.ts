// src/routes/food-catalog.routes.ts

import { t } from "elysia";
import { routeHandler, routeHandlerCtx } from "../lib/route-handler";
import { syncCatalogFromSheet } from "../food-catalog/sync";
import type { AppContext } from "../context";

export function registerFoodCatalogRoutes(app: any, ctx: AppContext): void {
  const { foodCatalogService, configService } = ctx;

  app
    // Pull new Sheet rows into the embedded catalog (idempotent).
    // `?refresh=true` re-embeds + upserts every row (e.g. after a parsing fix).
    .post("/food-catalog/sync", routeHandlerCtx(async ({ query }) => {
      const refresh = String(query?.refresh ?? "") === "true";
      return await syncCatalogFromSheet(foodCatalogService, {
        spreadsheetId: configService.googleSheetsId,
        credentialsJson: configService.googleCredentialsJson,
      }, refresh);
    }), {
      query: t.Object({ refresh: t.Optional(t.String()) }),
    })
    // How many foods are in the catalog.
    .get("/food-catalog/count", routeHandler(async () => {
      return { count: await foodCatalogService.count() };
    }))
    // Debug: nearest catalog matches for a free-text query.
    .get("/food-catalog/search", routeHandlerCtx(async ({ query }) => {
      const q = String(query?.q ?? "").trim();
      if (!q) return [];
      return await foodCatalogService.search(q);
    }), {
      query: t.Object({ q: t.Optional(t.String()) }),
    });
}
