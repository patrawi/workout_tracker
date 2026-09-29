import { test, expect, describe, mock } from "bun:test";
import { createGymsRepository } from "../../../src/repositories/gyms.repository";

describe("createGymsRepository", () => {
  test("creates repository with all methods", () => {
    const repo = createGymsRepository({} as any);

    expect(typeof repo.list).toBe("function");
    expect(typeof repo.findByIdAndUser).toBe("function");
    expect(typeof repo.findOrCreateByName).toBe("function");
  });

  test("findOrCreateByName returns the inserted row on first use", async () => {
    const row = { id: 7, user_id: 1, name: "Iron House", created_at: null };
    const returning = mock(async () => [row]);
    const onConflictDoNothing = mock(() => ({ returning }));
    const values = mock(() => ({ onConflictDoNothing }));
    const db = { insert: mock(() => ({ values })) } as any;

    const repo = createGymsRepository(db);
    const result = await repo.findOrCreateByName("Iron House", 1);

    expect(result).toEqual(row);
  });

  test("findOrCreateByName falls back to select after a name conflict", async () => {
    const row = { id: 7, user_id: 1, name: "Iron House", created_at: null };
    const returning = mock(async () => []);
    const onConflictDoNothing = mock(() => ({ returning }));
    const values = mock(() => ({ onConflictDoNothing }));
    const limit = mock(async () => [row]);
    const select = mock(() => ({
      from: mock(() => ({
        where: mock(() => ({ limit })),
      })),
    }));
    const db = { insert: mock(() => ({ values })), select } as any;

    const repo = createGymsRepository(db);
    const result = await repo.findOrCreateByName("Iron House", 1);

    expect(result).toEqual(row);
  });
});
