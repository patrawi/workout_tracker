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
 */
export async function syncCatalogFromSheet(
  service: FoodCatalogService,
  cfg: SheetSourceConfig,
): Promise<CatalogSyncResult> {
  const rows = await readSheetFoodRows(cfg);
  const existing = await service.getExistingRowIds();

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
