// src/routes/coach.routes.ts

import { t } from "elysia";
import { routeHandler, routeHandlerCtx } from "../lib/route-handler";
import type { AppContext } from "../context";

const planExerciseSchema = t.Object({
  position: t.Number(),
  exercise_name: t.String(),
  is_bodyweight: t.Boolean(),
  target_weight: t.Union([t.Number(), t.Null()]),
  sets: t.Number(),
  rep_low: t.Number(),
  rep_high: t.Number(),
  rpe_low: t.Number(),
  rpe_high: t.Number(),
  notes: t.String(),
});

export function registerCoachRoutes(app: any, ctx: AppContext): void {
  const { coachService } = ctx;

  app
    .post(
      "/coach/chat",
      routeHandlerCtx(async ({ body }) => {
        return await coachService.chat(body.messages);
      }),
      {
        body: t.Object({
          messages: t.Array(
            t.Object({
              role: t.Union([t.Literal("user"), t.Literal("coach")]),
              text: t.String(),
            })
          ),
        }),
      }
    )
    .post(
      "/coach/chat/stream",
      ({ body }: { body: { messages: { role: "user" | "coach"; text: string }[] } }) => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          async start(controller) {
            const send = (obj: unknown) =>
              controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
            try {
              for await (const delta of coachService.chatStream(body.messages)) {
                send(delta);
              }
              send({ done: true });
            } catch (err) {
              send({ error: String(err) });
            } finally {
              controller.close();
            }
          },
        });
        return new Response(stream, {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
          },
        });
      },
      {
        body: t.Object({
          messages: t.Array(
            t.Object({
              role: t.Union([t.Literal("user"), t.Literal("coach")]),
              text: t.String(),
            })
          ),
        }),
      }
    )
    .get(
      "/coach/plan",
      routeHandler(async () => {
        return await coachService.getPlan();
      })
    )
    .post(
      "/coach/plan/next",
      routeHandlerCtx(async ({ body }) => {
        return await coachService.proposeNextSession(body.day_type);
      }),
      {
        body: t.Object({ day_type: t.String() }),
      }
    )
    .put(
      "/coach/plan",
      routeHandlerCtx(async ({ body }) => {
        return await coachService.savePlan(body.day_type, body.exercises);
      }),
      {
        body: t.Object({
          day_type: t.String(),
          exercises: t.Array(planExerciseSchema),
        }),
      }
    )

    // ── Coach Knowledge ──
    .get(
      "/coach/knowledge",
      routeHandler(async () => {
        return await coachService.listKnowledge();
      })
    )
    .post(
      "/coach/knowledge",
      routeHandlerCtx(async ({ body }) => {
        return await coachService.addKnowledge(body.title, body.body);
      }),
      {
        body: t.Object({ title: t.String(), body: t.String() }),
      }
    )
    .put(
      "/coach/knowledge/:id",
      routeHandlerCtx(async ({ params, body }) => {
        return await coachService.updateKnowledge(Number(params.id), { title: body.title, body: body.body });
      }),
      {
        params: t.Object({ id: t.String() }),
        body: t.Object({ title: t.Optional(t.String()), body: t.Optional(t.String()) }),
      }
    )
    .delete(
      "/coach/knowledge/:id",
      routeHandlerCtx(async ({ params }) => {
        await coachService.deleteKnowledge(Number(params.id));
        return { ok: true };
      }),
      {
        params: t.Object({ id: t.String() }),
      }
    )
    .put(
      "/coach/knowledge/reorder",
      routeHandlerCtx(async ({ body }) => {
        await coachService.reorderKnowledge(body.ids);
        return { ok: true };
      }),
      {
        body: t.Object({ ids: t.Array(t.Number()) }),
      }
    );
}
