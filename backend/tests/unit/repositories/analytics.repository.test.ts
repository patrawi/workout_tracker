import { test, expect, describe, mock } from "bun:test";
import { createAnalyticsRepository } from "../../../src/repositories/analytics.repository";

describe("createAnalyticsRepository", () => {
  test("creates repository with all methods", () => {
    const mockDb = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            groupBy: mock(async () => []),
            orderBy: mock(async () => []),
          })),
        })),
      })),
    };

    const repo = createAnalyticsRepository(mockDb as any);

    expect(typeof repo.getHeatmap).toBe("function");
    expect(typeof repo.getVolume).toBe("function");
    expect(typeof repo.getMuscleDetail).toBe("function");
  });

  test("getMuscleDetail maps weekly volume, exercises and 7-day stats", async () => {
    let call = 0;
    const makeChain = (rows: unknown[], grouped: boolean) => ({
      from: mock(() => ({
        where: grouped
          ? mock(() => ({
              groupBy: mock(() => ({
                orderBy: mock(async () => rows),
              })),
            }))
          : mock(async () => rows),
      })),
    });
    const mockDb = {
      select: mock(() => {
        call++;
        if (call === 1) return makeChain([{ week: "2026-09-07", volume: 1200 }], true);
        if (call === 2) return makeChain([{ name: "Bench Press", top_weight: 54, sets: 8 }], true);
        return makeChain([{ sets: 16, exercises: 4 }], false);
      }),
    };

    const repo = createAnalyticsRepository(mockDb as any);
    const detail = await repo.getMuscleDetail("Chest", 7);

    expect(detail.muscle_group).toBe("Chest");
    expect(detail.sets_7d).toBe(16);
    expect(detail.exercises_7d).toBe(4);
    expect(detail.weekly_volume).toEqual([{ week_start: "2026-09-07", volume_load: 1200 }]);
    expect(detail.exercises).toEqual([{ name: "Bench Press", top_weight: 54, sets: 8 }]);
  });

  test("getHeatmap returns empty array", async () => {
    let callCount = 0;
    const mockDb = {
      select: mock(() => {
        callCount++;
        // First call: workout query with groupBy
        // Second call: restDays query without groupBy
        if (callCount === 1) {
          return {
            from: mock(() => ({
              where: mock(() => ({
                groupBy: mock(async () => []),
              })),
            })),
          };
        }
        return {
          from: mock(() => ({
            where: mock(async () => []),
          })),
        };
      }),
    };

    const repo = createAnalyticsRepository(mockDb as any);

    const result = await repo.getHeatmap();
    expect(result).toEqual([]);
    expect(callCount).toBe(2); // Two select calls: workouts and restDays
  });

  test("getVolume returns empty array", async () => {
    const mockDb = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            groupBy: mock(() => ({
              orderBy: mock(async () => []),
            })),
          })),
        })),
      })),
    };

    const repo = createAnalyticsRepository(mockDb as any);

    const result = await repo.getVolume(7);
    expect(result).toEqual([]);
  });

  test("getVolumeTrend computes delta_pct from the two windows", async () => {
    const mockDb = {
      select: mock(() => ({
        from: mock(() => ({
          where: mock(() => ({
            groupBy: mock(() => ({
              orderBy: mock(async () => [
                { muscle_group: "Chest", current_volume_load: 9000, previous_volume_load: 12000, current_sets: 30, previous_sets: 38 },
                { muscle_group: "Back", current_volume_load: 8000, previous_volume_load: 0, current_sets: 33, previous_sets: 0 },
              ]),
            })),
          })),
        })),
      })),
    };

    const repo = createAnalyticsRepository(mockDb as any);
    const result = await repo.getVolumeTrend(14);

    expect(result[0]).toEqual({
      muscle_group: "Chest",
      current_volume_load: 9000,
      previous_volume_load: 12000,
      current_sets: 30,
      previous_sets: 38,
      delta_pct: -25,
    });
    // previous window empty → delta_pct null, not Infinity
    expect(result[1]?.delta_pct).toBeNull();
  });
});
