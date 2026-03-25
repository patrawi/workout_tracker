import { t } from "elysia";
import { getBodyweightLogs, insertBodyweightLog } from "../db";
import { ok, fail, getErrorMessage } from "../lib/api";
import { parseDaysBack } from "../lib/validation";

type BodyweightRouteApp = {
  get(
    path: string,
    handler: (context: BodyweightQueryContext) => Promise<unknown>,
  ): BodyweightRouteApp;
  post(
    path: string,
    handler: (context: CreateBodyweightContext) => Promise<unknown>,
    options: { body: ReturnType<typeof t.Object> },
  ): BodyweightRouteApp;
};

type BodyweightQueryContext = {
  query: {
    days?: string;
  };
};

type CreateBodyweightContext = {
  body: {
    date: string;
    weight_kg: number;
  };
};

export function registerBodyweightRoutes(
  app: BodyweightRouteApp,
): BodyweightRouteApp {
  return app
    .get("/bodyweight", async ({ query }: BodyweightQueryContext) => {
      try {
        const days = parseDaysBack(query.days, 0);
        const logs = await getBodyweightLogs(days);
        return ok(logs);
      } catch (error) {
        return fail(getErrorMessage(error));
      }
    })
    .post(
      "/bodyweight",
      async ({ body }: CreateBodyweightContext) => {
        try {
          await insertBodyweightLog(body.date, body.weight_kg);
          return ok({ success: true });
        } catch (error) {
          return fail(getErrorMessage(error));
        }
      },
      {
        body: t.Object({
          date: t.String(),
          weight_kg: t.Number(),
        }),
      },
    );
}
