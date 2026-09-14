// Generic index-list editor for editable row collections (review-step proposal
// components, measured-mode weight rows). Replaces the pasted
// updateComponent/updateMeasuredRow/add/remove twins in LogMealModal.
import { useCallback, useState } from "react";

/** A row plus the stable id assigned at creation — safe React keys even after removals. */
export interface IdentifiedRow<T> {
    id: number;
    row: T;
}

let nextRowId = 1;

function identify<T>(row: T): IdentifiedRow<T> {
    return { id: nextRowId++, row };
}

/**
 * Immutable update/remove/add/replace over an identified row list. `makeRow`
 * supplies fresh rows for add() and the initial entry; rows removed from the
 * middle keep every other row's id stable.
 */
export function useRowList<T extends object>(makeRow: () => T) {
    const [rows, setRows] = useState<IdentifiedRow<T>[]>(() => [identify(makeRow())]);

    const update = useCallback((index: number, patch: Partial<T>) => {
        setRows((prev) =>
            prev.map((entry, i) =>
                i === index ? { ...entry, row: { ...entry.row, ...patch } } : entry,
            ),
        );
    }, []);

    const remove = useCallback((index: number) => {
        setRows((prev) => prev.filter((_, i) => i !== index));
    }, []);

    const add = useCallback(() => {
        setRows((prev) => [...prev, identify(makeRow())]);
    }, [makeRow]);

    /** Swap the whole list (e.g. loading a VLM proposal) — fresh ids for every row. */
    const replaceAll = useCallback((next: T[]) => {
        setRows(next.map(identify));
    }, []);

    return { rows, update, remove, add, replaceAll };
}
