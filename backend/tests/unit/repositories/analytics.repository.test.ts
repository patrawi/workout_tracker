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
});
