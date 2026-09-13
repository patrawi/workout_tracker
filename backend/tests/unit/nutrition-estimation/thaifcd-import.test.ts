// Unit tests for the ThaiFCD reference import (ADR 0002):
// CSV parsing, column-mapping rules (`-` handling, duplicate energy/carb
// resolution, name mapping), and the bulk idempotent upsert (mocked db —
// hand-rolled bun:test mocks, no live database).
import { afterAll, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PgDialect } from "drizzle-orm/pg-core";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import {
  THAIFCD_COLUMNS,
  THAIFCD_PROVIDER,
  parseCsv,
  parseThaifcdCsv,
  parseThaifcdNumber,
  thaifcdEmbedText,
  type ThaifcdReferenceRow,
} from "../../../src/nutrition-estimation/thaifcd-import";
import {
  UPSERT_CHUNK_SIZE,
  createNutritionReferenceImportRepository,
} from "../../../src/repositories/nutrition-reference-import.repository";
import { nutritionReferences } from "../../../src/schema";

const dialect = new PgDialect();

// The real ThaiFCD export header (byte-for-byte, including the BOM the file
// carries) so the fixture proves the mapping against the actual column names.
const HEADER = [
  "number",
  "food_code",
  "thai_name",
  "english_name",
  "scientific_name",
  "Ash (g)",
  "Calcium (mg)",
  '"Carbohydrate, available (g)"',
  '"Carbohydrate, total (g)"',
  "Cholesterol (mg)",
  "Copper (mg)",
  "Density (g/mL)",
  "Dietary fibre (g)",
  "Edible portion (%)",
  '"Energy, by calculation (kcal)"',
  '"Fat, total (g)"',
  '"Fatty acids, total monounsaturated (g)"',
  '"Fatty acids, total omega-3 polyunsaturated (g)"',
  '"Fatty acids, total omega-6 polyunsaturated (g)"',
  '"Fatty acids, total polyunsaturated (g)"',
  '"Fatty acids, total saturated (g)"',
  "Iron (mg)",
  "Magnesium (mg)",
  "Moisture (g)",
  "Niacin (mg)",
  "Phosphorus (mg)",
  "Potassium (mg)",
  '"Protein, total (g)"',
  "Retinol (mcg)",
  "Riboflavin (mg)",
  "Sodium (mg)",
  '"Sugars, total (g)"',
  "Thiamin (mg)",
  "Total energy - by calculation (kcal)",
  "Vitamin A; retinol activity equivalent (mcg)",
  "Vitamin C (mg)",
  "Zinc (mg)",
  "b-carotene (mcg)",
  "detail_url",
].join(",");

/** Row cells in header order; unset cells default to the missing marker `-`. */
const HEADER_NAMES = parseCsv(HEADER)[0]!;
function csvRow(cells: Partial<Record<string, string>>): string {
  const values = HEADER_NAMES.map((name) => {
    const value = cells[name];
    if (value === undefined) return "-";
    return value.includes(",") || value.includes('"') ? `"${value.replace(/"/g, '""')}"` : value;
  });
  return values.join(",");
}

const fixtureDirs: string[] = [];
/** Write a synthetic ThaiFCD fixture CSV (with the real export's BOM) to a temp dir. */
function makeFixture(rows: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "thaifcd-import-test-"));
  fixtureDirs.push(dir);
  const path = join(dir, "fixture.csv");
  // Real file carries a UTF-8 BOM — mirror that.
  writeFileSync(path, "\uFEFF" + [HEADER, ...rows].join("\n") + "\n");
  return path;
}
afterAll(() => {
  for (const dir of fixtureDirs) rmSync(dir, { recursive: true, force: true });
});

describe("parseCsv", () => {
  test("handles BOM, quoted fields with commas, escaped quotes and CRLF", () => {
    const csv = '\uFEFFname,note\n"Curry, green","say ""hi"""\r\n"ข้าว, ผัด","plain"\r\n';
    expect(parseCsv(csv)).toEqual([
      ["name", "note"],
      ["Curry, green", 'say "hi"'],
      ["ข้าว, ผัด", "plain"],
    ]);
  });

  test("skips blank lines and keeps empty trailing fields", () => {
    expect(parseCsv("a,b\n\n1,\n")).toEqual([
      ["a", "b"],
      ["1", ""],
    ]);
  });
});

describe("parseThaifcdNumber", () => {
  test("`-` and empty are missing; other values parse; junk is missing", () => {
    expect(parseThaifcdNumber("-")).toBeNull();
    expect(parseThaifcdNumber("  ")).toBeNull();
    expect(parseThaifcdNumber("31.30")).toBe(31.3);
    expect(parseThaifcdNumber("n/a")).toBeNull();
  });
});

describe("parseThaifcdCsv — synthetic fixture (real header names)", () => {
  const fixturePath = makeFixture([
    // Row A: everything present via the primary columns; names padded with spaces.
    csvRow({
      food_code: "T001",
      thai_name: "  แกงเขียวหวาน  ",
      english_name: " Green Curry ",
      "Protein, total (g)": "10.50",
      "Carbohydrate, total (g)": "20.00",
      "Energy, by calculation (kcal)": "205",
      "Fat, total (g)": "5.25",
      "Calcium (mg)": "15",
      "Sodium (mg)": "-",
      "Iron (mg)": "1.20",
    }),
    // Row B: primary energy `-` → fallback kcal column; total carbs `-` →
    // available; protein `-` → 0; english name empty → null.
    csvRow({
      food_code: "T002",
      thai_name: "ขนมถ้วยฟู",
      english_name: "",
      "Protein, total (g)": "-",
      "Carbohydrate, available (g)": "40.0",
      "Energy, by calculation (kcal)": "-",
      "Total energy - by calculation (kcal)": "300",
      "Fat, total (g)": "12.5",
      "Vitamin C (mg)": "2",
    }),
    // Row C: quoted names with commas; every core macro missing → 0; no extras.
    csvRow({
      food_code: "T003",
      thai_name: "กบ, ทอดกรอบ, ผัดเผ็ด",
      english_name: "Frog, fried, spicy",
      "Protein, total (g)": "-",
      "Carbohydrate, total (g)": "-",
      "Carbohydrate, available (g)": "-",
      "Energy, by calculation (kcal)": "-",
      "Fat, total (g)": "-",
    }),
    // Row D: no food_code → skipped entirely.
    csvRow({ food_code: "", thai_name: "ไม่มีรหัส" }),
  ]);

  const text = readFileSync(fixturePath, "utf8");
  const { rows, stats } = parseThaifcdCsv(text, "test-version");

  test("imports all rows with a food_code and skips rows without one", () => {
    expect(rows).toHaveLength(3);
    expect(stats.totalRows).toBe(3);
    expect(stats.skippedRows).toBe(1);
    expect(rows.map((r) => r.provider_food_code)).toEqual(["T001", "T002", "T003"]);
  });

  test("maps names: trimmed, english_name empty → null, provider/version stamped", () => {
    expect(rows[0]!.name_th).toBe("แกงเขียวหวาน");
    expect(rows[0]!.name_en).toBe("Green Curry");
    expect(rows[1]!.name_en).toBeNull();
    expect(rows[1]!.name_th).toBe("ขนมถ้วยฟู");
    for (const row of rows) {
      expect(row.provider).toBe(THAIFCD_PROVIDER);
      expect(row.version).toBe("test-version");
    }
  });

  test("`-` core macros → 0 (never fabricate a nonzero claim), row still imported", () => {
    expect(rows[0]!.protein).toBe(10.5);
    expect(rows[1]!.protein).toBe(0);
    expect(rows[1]!.fat).toBe(12.5);
    // Row C: every core macro missing → zeros; alcohol has no column → 0.
    expect(rows[2]!.protein).toBe(0);
    expect(rows[2]!.carbs).toBe(0);
    expect(rows[2]!.fat).toBe(0);
    expect(rows[2]!.calories).toBe(0);
    expect(rows[2]!.alcohol).toBe(0);
    expect(stats.missingMacros.protein).toBe(2);
    expect(stats.missingMacros.calories).toBe(1);
  });

  test("duplicate energy columns: primary kcal wins, fallback used when primary is `-`", () => {
    expect(rows[0]!.calories).toBe(205);
    expect(rows[1]!.calories).toBe(300); // "Total energy - by calculation (kcal)"
    expect(stats.fallbackEnergyRows).toBe(1);
  });

  test("duplicate carbohydrate columns: total preferred, available is fallback", () => {
    expect(rows[0]!.carbs).toBe(20); // total present
    expect(rows[1]!.carbs).toBe(40); // only available present
    expect(stats.fallbackCarbsRows).toBe(1);
  });

  test("micronutrients: present values kept in extra_nutrients, `-` keys omitted, none → null", () => {
    expect(rows[0]!.extra_nutrients).toEqual({ calcium_mg: 15, iron_mg: 1.2 });
    expect(rows[0]!.extra_nutrients).not.toHaveProperty("sodium_mg");
    expect(rows[1]!.extra_nutrients).toEqual({ vitamin_c_mg: 2 });
    expect(rows[2]!.extra_nutrients).toBeNull();
    expect(stats.rowsWithExtras).toBe(2);
  });

  test("missing required header columns fail loudly", () => {
    expect(() => parseThaifcdCsv("food_code,thai_name\nT1,x\n", "v")).toThrow(
      /missing expected ThaiFCD columns/i,
    );
  });
});

// ——— Bulk upsert with a hand-rolled mock db (no live database) ———

interface CapturedInsert {
  table: unknown;
  chunk: ThaifcdReferenceRow[];
  conflict: { target: unknown[]; set: Record<string, unknown> } | null;
}

function makeMockDb(captured: { inserts: CapturedInsert[]; countQueries: unknown[] }) {
  const db = {
    insert: mock((table: unknown) => {
      const entry: CapturedInsert = { table, chunk: [], conflict: null };
      captured.inserts.push(entry);
      return {
        values: (chunk: ThaifcdReferenceRow[]) => {
          entry.chunk = chunk;
          return {
            onConflictDoUpdate: async (opts: { target: unknown[]; set: Record<string, unknown> }) => {
              entry.conflict = opts;
              return undefined;
            },
          };
        },
      };
    }),
    select: mock(() => ({
      from: () => ({
        where: async (whereExpr: unknown) => {
          captured.countQueries.push(whereExpr);
          return [{ count: 7 }];
        },
      }),
    })),
  };
  return db as unknown as PostgresJsDatabase;
}

function makeRows(n: number, version = "v1"): ThaifcdReferenceRow[] {
  return Array.from({ length: n }, (_, i) => ({
    provider: THAIFCD_PROVIDER,
    provider_food_code: `T${String(i).padStart(4, "0")}`,
    version,
    name_en: `Food ${i}`,
    name_th: null,
    protein: 1,
    carbs: 2,
    fat: 3,
    alcohol: 0,
    calories: 40,
    extra_nutrients: null,
    embedding: null,
  }));
}

describe("upsertThaifcdBatch — chunking", () => {
  test("inserts 1100 rows in chunks of 500 against the nutrition_references table", async () => {
    const captured = { inserts: [] as CapturedInsert[], countQueries: [] as unknown[] };
    const repo = createNutritionReferenceImportRepository(makeMockDb(captured));
    const processed = await repo.upsertThaifcdBatch(makeRows(1100));
    expect(processed).toBe(1100);
    expect(UPSERT_CHUNK_SIZE).toBe(500);
    expect(captured.inserts).toHaveLength(3);
    expect(captured.inserts.map((c) => c.chunk.length)).toEqual([500, 500, 100]);
    for (const insert of captured.inserts) {
      expect(insert.table).toBe(nutritionReferences);
    }
    // Chunks must cover every row exactly once, in order.
    const codes = captured.inserts.flatMap((c) => c.chunk.map((r) => r.provider_food_code));
    expect(codes).toHaveLength(1100);
    expect(new Set(codes).size).toBe(1100);
  });

  test("a batch smaller than one chunk is a single insert; empty batch inserts nothing", async () => {
    const captured = { inserts: [] as CapturedInsert[], countQueries: [] as unknown[] };
    const repo = createNutritionReferenceImportRepository(makeMockDb(captured));
    expect(await repo.upsertThaifcdBatch(makeRows(10))).toBe(10);
    expect(await repo.upsertThaifcdBatch([])).toBe(0);
    expect(captured.inserts).toHaveLength(1);
    expect(captured.inserts[0]!.chunk).toHaveLength(10);
  });
});

describe("upsertThaifcdBatch — idempotency mapping", () => {
  test("conflicts on the unique (provider, provider_food_code, version) index", async () => {
    const captured = { inserts: [] as CapturedInsert[], countQueries: [] as unknown[] };
    const repo = createNutritionReferenceImportRepository(makeMockDb(captured));
    await repo.upsertThaifcdBatch(makeRows(2));
    const conflict = captured.inserts[0]!.conflict!;
    expect(conflict.target.map((col) => (col as { name: string }).name)).toEqual([
      "provider",
      "provider_food_code",
      "version",
    ]);
  });

  test("update set takes every value from the excluded row", async () => {
    const captured = { inserts: [] as CapturedInsert[], countQueries: [] as unknown[] };
    const repo = createNutritionReferenceImportRepository(makeMockDb(captured));
    await repo.upsertThaifcdBatch(makeRows(1));
    const set = captured.inserts[0]!.conflict!.set;
    expect(Object.keys(set).sort()).toEqual(
      [
        "alcohol",
        "calories",
        "carbs",
        "embedding",
        "extra_nutrients",
        "fat",
        "name_en",
        "name_th",
        "protein",
      ].sort(),
    );
    for (const key of ["name_en", "name_th", "protein", "carbs", "fat", "alcohol", "calories", "extra_nutrients"]) {
      expect(dialect.sqlToQuery(set[key] as never).sql).toBe(`excluded.${key}`);
    }
  });

  test("embedding update preserves an existing vector when the incoming one is null", async () => {
    const captured = { inserts: [] as CapturedInsert[], countQueries: [] as unknown[] };
    const repo = createNutritionReferenceImportRepository(makeMockDb(captured));
    await repo.upsertThaifcdBatch(makeRows(1));
    const set = captured.inserts[0]!.conflict!.set;
    // Re-running the import without --embed must not clobber stored embeddings.
    expect(dialect.sqlToQuery(set.embedding as never).sql).toBe(
      'coalesce(excluded.embedding, "nutrition_references"."embedding")',
    );
  });
});

describe("countByProviderVersion", () => {
  test("filters on provider and version and returns the count", async () => {
    const captured = { inserts: [] as CapturedInsert[], countQueries: [] as unknown[] };
    const repo = createNutritionReferenceImportRepository(makeMockDb(captured));
    const count = await repo.countByProviderVersion(THAIFCD_PROVIDER, "2026-09-13");
    expect(count).toBe(7);
    expect(captured.countQueries).toHaveLength(1);
    const query = dialect.sqlToQuery(captured.countQueries[0] as never);
    expect(query.params).toEqual([THAIFCD_PROVIDER, "2026-09-13"]);
    expect(query.sql).toContain("nutrition_references");
  });
});

describe("thaifcdEmbedText", () => {
  test("joins Thai and English names with a space; handles nulls", () => {
    expect(thaifcdEmbedText({ name_th: "ข้าวผัด", name_en: "Fried Rice" })).toBe("ข้าวผัด Fried Rice");
    expect(thaifcdEmbedText({ name_th: "ข้าวผัด", name_en: null })).toBe("ข้าวผัด");
    expect(thaifcdEmbedText({ name_th: null, name_en: "Fried Rice" })).toBe("Fried Rice");
    expect(thaifcdEmbedText({ name_th: null, name_en: null })).toBe("");
  });
});
