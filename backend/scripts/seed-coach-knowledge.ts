/**
 * Seed the coach_knowledge table with the current knowledge.md content.
 * Idempotent — skips if rows already exist.
 *
 * Run from the backend dir:  bun run scripts/seed-coach-knowledge.ts
 */
import { readFileSync } from "fs";
import { config } from "../src/config";
import { createDatabaseClient } from "../src/db/client";
import { createCoachKnowledgeRepository } from "../src/repositories/coach-knowledge.repository";

const db = createDatabaseClient(config.databaseUrl);
const repo = createCoachKnowledgeRepository(db);

const existing = await repo.list();
if (existing.length > 0) {
  console.log("ℹ️  coach_knowledge already seeded, skipping.");
  process.exit(0);
}

const body = readFileSync("src/coach/knowledge.md", "utf8");
await repo.create("Training doc", body);

console.log("✅ Seeded coach_knowledge: 1 section (Training doc)");
process.exit(0);
