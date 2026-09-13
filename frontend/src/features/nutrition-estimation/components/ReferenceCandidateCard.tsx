// One selectable reference card (S2.4) — shared by the ambiguous-candidates list
// in LogMealModal and the search results in ReferenceSearchPanel. Both feed the
// unified MealObservationReference shape (search items are mapped at the api layer).
import { roundToWhole } from "@/features/nutrition-estimation/format";
import type { MealObservationReference } from "@/types";

interface ReferenceCandidateCardProps {
    candidate: MealObservationReference;
    onPick: () => void;
}

export default function ReferenceCandidateCard({ candidate, onPick }: ReferenceCandidateCardProps) {
    const name = candidate.nameEn ?? candidate.nameTh ?? `Reference #${candidate.id}`;
    return (
        <button
            type="button"
            onClick={onPick}
            className="w-full text-left rounded-xl bg-surface-100/50 border border-surface-300/20 hover:border-emerald-500/50 transition-colors px-4 py-3"
            aria-label={`Use reference ${name}`}
        >
            <div className="text-sm text-white font-medium">{name}</div>
            <div className="text-xs text-surface-400 mt-0.5">
                {candidate.provider} v{candidate.version} · code {candidate.providerFoodCode} ·{" "}
                {roundToWhole(candidate.per100.calories)} kcal / 100 g
            </div>
        </button>
    );
}
