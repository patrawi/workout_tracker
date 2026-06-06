import {
  readSheetFoodRows,
  sheetRowToCatalogRecord,
  type SheetSourceConfig,
} from "./sheet-source";
import type { FoodCatalogService } from "../services/food-catalog.service";

export interface CatalogSyncResult {
  /** New rows or rows whose embedded text changed — embedded + upserted. */
  added: number;
  /** Rows whose only change is macros — updated without an embedding call. */
  updated: number;
  /** Unchanged rows — left alone. */
  skipped: number;
  total: number;
}

/**
 * Pull all rows from the nutrition Sheet and diff each against its stored hashes
 * (keyed on the stable `sheet-row-N` id):
 *   - new row OR `doc_hash` changed → embed + upsert (costs an embedding call)
 *   - only `macro_hash` changed     → update macros, no embedding call
 *   - nothing changed               → skip
 * This auto-applies sheet edits on a normal sync and only spends embedding
 * quota on rows whose embedded text actually changed.
 *
 * Pass `refresh` to force-embed every row (e.g. after changing the embedded-doc
 * shape). At ~100 rows that's a single batch request, well under the RPM limit.
 */
export async function syncCatalogFromSheet(
  service: FoodCatalogService,
  cfg: SheetSourceConfig,
  refresh = false,
): Promise<CatalogSyncResult> {
  const rows = (await readSheetFoodRows(cfg)).map(sheetRowToCatalogRecord);
  const existing = refresh
    ? new Map<string, { doc_hash: string | null; macro_hash: string | null }>()
    : await service.getRowHashes();

  const toEmbed: typeof rows = []; // new or embedded-text changed
  const macroOnly: typeof rows = []; // doc unchanged, macros changed
  for (const r of rows) {
    const prev = existing.get(r.id);
    if (!prev || prev.doc_hash !== r.doc_hash) toEmbed.push(r);
    else if (prev.macro_hash !== r.macro_hash) macroOnly.push(r);
  }

  await service.upsertMany(toEmbed);
  await service.updateMacros(macroOnly);

  return {
    added: toEmbed.length,
    updated: macroOnly.length,
    skipped: rows.length - toEmbed.length - macroOnly.length,
    total: rows.length,
  };
}
