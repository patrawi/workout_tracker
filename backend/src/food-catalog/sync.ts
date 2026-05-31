import {
  readSheetFoodRows,
  sheetRowToCatalogRecord,
  type SheetSourceConfig,
} from "./sheet-source";
import type { FoodCatalogService } from "../services/food-catalog.service";

export interface CatalogSyncResult {
  added: number;
  skipped: number;
  total: number;
}

/**
 * Pull all rows from the nutrition Sheet, diff by `source_row_id`, and embed +
 * upsert only the rows not already in the catalog. Idempotent: re-running skips
 * already-synced rows so embeddings aren't recomputed.
 *
 * Pass `refresh` to re-embed + upsert every row regardless of dedup — needed
 * after a parsing change (e.g. macro cells fixed) to refresh existing rows.
 */
export async function syncCatalogFromSheet(
  service: FoodCatalogService,
  cfg: SheetSourceConfig,
  refresh = false,
): Promise<CatalogSyncResult> {
  const rows = await readSheetFoodRows(cfg);
  const existing = refresh ? new Set<string>() : await service.getExistingRowIds();

  const newRecords = rows
    .map(sheetRowToCatalogRecord)
    .filter((r) => r.source_row_id !== null && !existing.has(r.source_row_id));

  await service.upsertMany(newRecords);

  return {
    added: newRecords.length,
    skipped: rows.length - newRecords.length,
    total: rows.length,
  };
}
