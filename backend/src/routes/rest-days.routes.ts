import { t } from "elysia";
import { deleteRestDay, upsertRestDay } from "../db";
import { fail, getErrorMessage, ok } from "../lib/api";

type RestDayApp = {
  post: (...args: any[]) => RestDayApp;
  delete: (...args: any[]) => RestDayApp;
};

export function registerRestDayRoutes(app: RestDayApp) {
  return app
    .post(
      "/rest-days",
      async ({
        body,
      }: {
        body: {
          date: string;
          walked_10k?: boolean;
          did_liss?: boolean;
          did_stretch?: boolean;
          notes?: string;
        };
      }) => {
        try {
          const restDay = await upsertRestDay(body);
          return ok(restDay);
        } catch (error) {
          return fail(getErrorMessage(error));
        }
      },
      {
        body: t.Object({
          date: t.String(),
          walked_10k: t.Optional(t.Boolean()),
          did_liss: t.Optional(t.Boolean()),
          did_stretch: t.Optional(t.Boolean()),
          notes: t.Optional(t.String()),
        }),
      },
    )
    .delete(
      "/rest-days/:date",
      async ({ params }: { params: { date: string } }) => {
        try {
          const deleted = await deleteRestDay(params.date);

          if (!deleted) {
            return fail("Rest day not found.");
          }

          return ok({ deleted: true });
        } catch (error) {
          return fail(getErrorMessage(error));
        }
      },
    );
}
