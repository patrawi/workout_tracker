// Debounced reference search + candidate cards (design spec §7), shared by the
// pending-meal dialog and the log-meal result "Change reference" action (ADR 0020).
// Empty input never hits the wire — the endpoint 422s on a missing q.
import { useEffect, useId, useState } from "react";
import { useReferenceSearch } from "@/features/nutrition-estimation/hooks/useMealObservations";
import ReferenceCandidateCard from "./ReferenceCandidateCard";

interface ReferenceSearchPanelProps {
    onPick: (referenceId: number) => void;
    /** Label above the search input. */
    label: string;
    placeholder?: string;
}

export default function ReferenceSearchPanel({
    onPick,
    label,
    placeholder = "e.g. chicken rice / ข้าวมันไก่",
}: ReferenceSearchPanelProps) {
    const inputId = useId();

    // Debounced search input (300 ms).
    const [searchInput, setSearchInput] = useState("");
    const [debounced, setDebounced] = useState("");
    useEffect(() => {
        const t = setTimeout(() => setDebounced(searchInput.trim()), 300);
        return () => clearTimeout(t);
    }, [searchInput]);

    const {
        data: results,
        isFetching,
        error: searchError,
    } = useReferenceSearch(debounced.length > 0 ? debounced : null);

    return (
        <div className="space-y-2">
            <label htmlFor={inputId} className="text-xs text-surface-400 block">
                {label}
            </label>
            <input
                id={inputId}
                type="text"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder={placeholder}
                className="glass-input w-full px-3 py-2.5 text-sm text-white"
            />
            {searchError && (
                <p role="alert" className="text-xs text-red-300">
                    {searchError instanceof Error ? searchError.message : "Search failed"}
                </p>
            )}
            {isFetching && (
                <div className="space-y-2" aria-hidden="true">
                    <div className="skeleton h-14 rounded-xl" />
                    <div className="skeleton h-14 rounded-xl" />
                </div>
            )}
            {!isFetching && debounced.length === 0 && (
                <p className="text-xs text-surface-400">
                    Type a food name to search the reference catalog.
                </p>
            )}
            {!isFetching && debounced.length > 0 && results && results.length === 0 && (
                <p className="text-xs text-surface-400">No references found.</p>
            )}
            {!isFetching && results && results.length > 0 && (
                <div className="space-y-2">
                    {results.map((item) => (
                        <ReferenceCandidateCard
                            key={item.id}
                            candidate={item}
                            onPick={() => onPick(item.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
}
