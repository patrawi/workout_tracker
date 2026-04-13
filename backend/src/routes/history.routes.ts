// src/routes/history.routes.ts

import { routeHandler } from "../lib/route-handler";
import type { AppContext } from "../context";

export function registerHistoryRoutes(app: any, ctx: AppContext): void {
  const { historyService } = ctx;

  app
    .get("/history/dates", routeHandler(async () => {
      return await historyService.getDates();
    }));
}
