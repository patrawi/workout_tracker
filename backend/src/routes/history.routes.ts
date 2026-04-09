import { ok, fail, getErrorMessage } from "../lib/api";
import { getHistoryDates, type HistoryDate } from "../repositories/history.repository";
import type { ApiResponse } from "../types";

type HistoryRouteApp = {
  get: (...args: any[]) => HistoryRouteApp;
};

export function registerHistoryRoutes(app: HistoryRouteApp): HistoryRouteApp {
  return app.get(
    "/history/dates",
    async (): Promise<ApiResponse<HistoryDate[]>> => {
      try {
        const dates = await getHistoryDates();
        return ok(dates);
      } catch (error) {
        return fail(getErrorMessage(error));
      }
    },
  );
}
