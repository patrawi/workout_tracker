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
