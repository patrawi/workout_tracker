/**
 * One-off repair for the Nutrition Reference Catalog (2026-10-06).
 *
 * Two shipped defects, found when "ข้าวเหนียว 150 g + หมูพวง 180 g" estimated
 * at 555 kcal (real ~820):
 *  1. ThaiFCD's export is independently incomplete — many rows carry "-" for
 *     one of Energy/CHOCDF while the other holds a real value, and the import
 *     stored those as literal zeros (ข้าวเหนียว,นึ่ง = 232 kcal with 0 g
 *     carbs; หมูกรอบ = 46.9 g fat with 0 kcal). This script recovers the
 *     missing side with the same Atwater by-difference arithmetic the source
 *     used, now also in mapThaifcdRecord for future imports.
 *  2. BaoWio's ingredient export mixes unit conventions (กะปิ 360 g carbs /
 *     100 g, กระเทียมเจียว 2,100 kcal) — physically impossible per-100 g
 *     values are zeroed so such rows fall back to the kind prior instead of
 *     poisoning estimates.
 *
 * Usage (from backend/):  bun run scripts/fix-reference-macro-gaps.ts [--apply]
 * Dry-run by default; safe to re-run (idempotent — values already recovered
 * no longer match the gap criteria). The matcher's provider tie-break
 * (ThaiFCD > BaoWio, matcher.ts) is the other half of the fix.
 */
import "dotenv/config";
import { eq } from "drizzle-orm";
import { config } from "../src/config";
import { createDatabaseClient } from "../src/db/client";
import { nutritionReferences } from "../src/schema";
import { byDifferenceCalories, byDifferenceCarbs } from "../src/nutrition-estimation/thaifcd-import";

const apply = process.argv.includes("--apply");
const db = createDatabaseClient(config.databaseUrl);

const rows = await db
  .select({
    id: nutritionReferences.id,
    provider: nutritionReferences.provider,
    nameTh: nutritionReferences.name_th,
    protein: nutritionReferences.protein,
    carbs: nutritionReferences.carbs,
    fat: nutritionReferences.fat,
    calories: nutritionReferences.calories,
  })
  .from(nutritionReferences);

const carbFixes: Array<{ id: number; nameTh: string | null; from: number; to: number }> = [];
const kcalFixes: Array<{ id: number; nameTh: string | null; from: number; to: number }> = [];
const neutralized: Array<{ id: number; nameTh: string | null; field: string; from: number }> = [];

for (const r of rows) {
  const protein = r.protein ?? 0;
  const carbs = r.carbs ?? 0;
  const fat = r.fat ?? 0;
  const calories = r.calories ?? 0;

  // 1) ThaiFCD by-difference recovery — fill ONE missing side from the other.
  if (r.provider === "thaifcd") {
    if (calories === 0 && (protein > 0 || carbs > 0 || fat > 0)) {
      const derived = byDifferenceCalories(protein, carbs, fat);
      if (derived !== null) kcalFixes.push({ id: r.id, nameTh: r.nameTh, from: calories, to: derived });
    } else if (calories > 0 && carbs === 0) {
      const derived = byDifferenceCarbs(calories, protein, fat);
      if (derived !== null) carbFixes.push({ id: r.id, nameTh: r.nameTh, from: carbs, to: derived });
    }
  }

  // 2) Physically impossible per-100 g values (any provider) → 0, which makes
  // the row fall back to the kind prior at match time (positive-kcal gate).
  if (carbs > 100) neutralized.push({ id: r.id, nameTh: r.nameTh, field: `carbs ${carbs}→0`, from: carbs });
  if (calories > 900) neutralized.push({ id: r.id, nameTh: r.nameTh, field: `calories ${calories}→0`, from: calories });
  if (fat > 100) neutralized.push({ id: r.id, nameTh: r.nameTh, field: `fat ${fat}→0`, from: fat });
}

const sample = (list: { id: number; nameTh: string | null }[], n = 8) =>
  list.slice(0, n).map((x) => `  #${x.id} ${x.nameTh ?? "(null)"}`).join("\n");

console.log(`carbs recovered (kcal − 4P − 9F)/4 : ${carbFixes.length} rows`);
console.log(sample(carbFixes));
console.log(`kcal recovered 4P + 4C + 9F       : ${kcalFixes.length} rows`);
console.log(sample(kcalFixes));
console.log(`impossible values neutralized     : ${neutralized.length} rows`);
console.log(sample(neutralized));

if (!apply) {
  console.log("\nDRY RUN — pass --apply to write.");
  process.exit(0);
}

for (const fix of carbFixes) {
  await db.update(nutritionReferences).set({ carbs: fix.to }).where(eq(nutritionReferences.id, fix.id));
}
for (const fix of kcalFixes) {
  await db.update(nutritionReferences).set({ calories: fix.to }).where(eq(nutritionReferences.id, fix.id));
}
for (const n of neutralized) {
  const field = n.field.split(" ")[0];
  if (field === "carbs") await db.update(nutritionReferences).set({ carbs: 0 }).where(eq(nutritionReferences.id, n.id));
  else if (field === "calories") await db.update(nutritionReferences).set({ calories: 0 }).where(eq(nutritionReferences.id, n.id));
  else await db.update(nutritionReferences).set({ fat: 0 }).where(eq(nutritionReferences.id, n.id));
}
console.log(`\nAPPLIED: ${carbFixes.length} carbs + ${kcalFixes.length} kcal + ${neutralized.length} neutralized.`);
process.exit(0);
