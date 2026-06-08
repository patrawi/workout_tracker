import { asc, eq, max, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import { coachKnowledge } from "../schema";

export interface CoachKnowledgeRow {
    id: number;
    title: string;
    body: string;
    position: number;
    updated_at: string | null;
}

export function createCoachKnowledgeRepository(dbInstance: PostgresJsDatabase) {
    return {
        async list(): Promise<CoachKnowledgeRow[]> {
            return dbInstance
                .select()
                .from(coachKnowledge)
                .orderBy(asc(coachKnowledge.position));
        },

        async create(title: string, body: string): Promise<CoachKnowledgeRow> {
            const [highest] = await dbInstance
                .select({ pos: max(coachKnowledge.position) })
                .from(coachKnowledge);
            const nextPos = (highest?.pos ?? -1) + 1;
            const [row] = await dbInstance
                .insert(coachKnowledge)
                .values({ title, body, position: nextPos })
                .returning();
            return row!;
        },

        async update(id: number, data: { title?: string; body?: string }): Promise<CoachKnowledgeRow | null> {
            const [row] = await dbInstance
                .update(coachKnowledge)
                .set({ ...data, updated_at: sql`now()` })
                .where(eq(coachKnowledge.id, id))
                .returning();
            return row ?? null;
        },

        async delete(id: number): Promise<void> {
            await dbInstance.delete(coachKnowledge).where(eq(coachKnowledge.id, id));
        },

        async reorder(ids: number[]): Promise<void> {
            await dbInstance.transaction(async (tx) => {
                for (const [i, id] of ids.entries()) {
                    await tx
                        .update(coachKnowledge)
                        .set({ position: i })
                        .where(eq(coachKnowledge.id, id));
                }
            });
        },
    };
}
