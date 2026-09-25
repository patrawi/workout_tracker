import { test, expect, describe, mock } from "bun:test";
import { Column } from "drizzle-orm";
import { createCoachPlanRepository } from "../../../src/repositories/coach-plan.repository";

function planInput(exercise_name: string) {
  return {
    position: 1,
    exercise_name,
    is_bodyweight: false,
    target_weight: 100,
    sets: 3,
    rep_low: 8,
    rep_high: 10,
    rpe_low: 8,
    rpe_high: 9,
    exercise_role: "compound" as const,
    progression_ladder: "double_12" as const,
    notes: "",
  };
}

// The drizzle conditions handed to .where() are SQL trees: eq()/and() nest
// SQL chunks, the column appears as a Column chunk and the bound value as a
// Param chunk. Recursively confirm the predicate really targets user_id.
function hasScopedUserId(condition: any, userId: number): boolean {
  let hasColumn = false;
  let hasValue = false;
  const walk = (chunk: any) => {
    if (!chunk || typeof chunk !== "object") return;
    if (chunk instanceof Column && chunk.name === "user_id") {
      hasColumn = true;
    } else if (chunk.constructor?.name === "Param" && chunk.value === userId) {
      hasValue = true;
    }
    if (Array.isArray(chunk.queryChunks)) chunk.queryChunks.forEach(walk);
  };
  walk(condition);
  return hasColumn && hasValue;
}

function createMockDb() {
  const whereCaptures: any[] = [];
  // Select chains keep building after .where() (orderBy follows it).
  const captureSelectWhere = (expr: any) => {
    whereCaptures.push(expr);
    return { orderBy: mock(async () => []) };
  };
  const captureWhere = (expr: any) => {
    whereCaptures.push(expr);
    return Promise.resolve([]);
  };

  return {
    whereCaptures,
    select: mock(() => ({
      from: mock(() => ({
        where: mock(captureSelectWhere),
        orderBy: mock(async () => []),
      })),
    })),
    delete: mock(() => ({
      where: mock(captureWhere),
    })),
    transaction: mock(async (fn: (tx: any) => Promise<any>) =>
      fn({
        delete: mock(() => ({
          where: mock((expr: any) => {
            whereCaptures.push(expr);
          }),
        })),
        insert: mock(() => ({
          values: mock((values: any[]) => ({
            returning: mock(async () => values.map((v, i) => ({ id: i + 1, ...v }))),
          })),
        })),
      })
    ),
  };
}

describe("createCoachPlanRepository", () => {
  test("getAll filters by the requesting user", async () => {
    const db = createMockDb();
    const repo = createCoachPlanRepository(db as any);

    await repo.getAll(7);

    expect(db.whereCaptures).toHaveLength(1);
    expect(hasScopedUserId(db.whereCaptures[0], 7)).toBe(true);
  });

  test("getByDayType filters by the requesting user and day", async () => {
    const db = createMockDb();
    const repo = createCoachPlanRepository(db as any);

    await repo.getByDayType("Push", 7);

    expect(db.whereCaptures).toHaveLength(1);
    expect(hasScopedUserId(db.whereCaptures[0], 7)).toBe(true);
  });

  test("replaceDayType deletes and re-inserts only that user's day-type rows", async () => {
    const db = createMockDb();
    let inserted: any;
    db.transaction = mock(async (fn: (tx: any) => Promise<any>) =>
      fn({
        delete: mock(() => ({
          where: mock((expr: any) => {
            db.whereCaptures.push(expr);
          }),
        })),
        insert: mock(() => ({
          values: mock((values: any[]) => ({
            returning: mock(async () => {
              inserted = values;
              return values.map((v, i) => ({ id: i + 1, ...v }));
            }),
          })),
        })),
      })
    );
    const repo = createCoachPlanRepository(db as any);

    const result = await repo.replaceDayType("Push", [planInput("Bench Press")], 7);

    expect(db.whereCaptures).toHaveLength(1);
    expect(hasScopedUserId(db.whereCaptures[0], 7)).toBe(true);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].user_id).toBe(7);
    expect(inserted[0].day_type).toBe("Push");
    expect(result).toHaveLength(1);
  });

  test("replaceDayType with no rows only deletes (no insert)", async () => {
    const db = createMockDb();
    let inserted = false;
    db.transaction = mock(async (fn: (tx: any) => Promise<any>) =>
      fn({
        delete: mock(() => ({
          where: mock((expr: any) => {
            db.whereCaptures.push(expr);
          }),
        })),
        insert: mock(() => ({
          values: mock(() => ({
            returning: mock(async () => {
              inserted = true;
              return [];
            }),
          })),
        })),
      })
    );
    const repo = createCoachPlanRepository(db as any);

    const result = await repo.replaceDayType("Push", [], 7);

    expect(db.whereCaptures).toHaveLength(1);
    expect(hasScopedUserId(db.whereCaptures[0], 7)).toBe(true);
    expect(result).toEqual([]);
    expect(inserted).toBe(false);
  });
});
