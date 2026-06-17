import { useState } from "react";
import DatePicker from "@/components/DatePicker";
import { getLocalDateStr } from "@/lib/date-utils";

interface RestDayFormProps {
    onSubmit: (data: { date: string; walked_10k: boolean; did_liss: boolean; did_stretch: boolean; notes: string }) => Promise<void>;
    isLoading: boolean;
}

export default function RestDayForm({ onSubmit, isLoading }: RestDayFormProps) {
    const [date, setDate] = useState(getLocalDateStr);
    const [walked10k, setWalked10k] = useState(false);
    const [didLiss, setDidLiss] = useState(false);
    const [didStretch, setDidStretch] = useState(false);
    const [notes, setNotes] = useState("");

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        await onSubmit({
            date,
            walked_10k: walked10k,
            did_liss: didLiss,
            did_stretch: didStretch,
            notes,
        });
        // Reset form after submission
        setDate(getLocalDateStr());
        setWalked10k(false);
        setDidLiss(false);
        setDidStretch(false);
        setNotes("");
    };

    return (
        <form onSubmit={handleSubmit} className="glass-card p-4 lg:p-5" aria-label="Rest day input">
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-[var(--foreground)] flex items-center gap-2">
                        <span>🧘</span> Active Recovery Day
                    </h3>
                    <DatePicker value={date} onChange={setDate} disabled={isLoading} />
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <label className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={walked10k}
                            onChange={(e) => setWalked10k(e.target.checked)}
                            disabled={isLoading}
                            className="w-4 h-4 rounded border-white/20 bg-[var(--color-surface-200)] text-[var(--chart-1)] focus:ring-[var(--chart-1)]"
                        />
                        10K Steps 🚶
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={didLiss}
                            onChange={(e) => setDidLiss(e.target.checked)}
                            disabled={isLoading}
                            className="w-4 h-4 rounded border-white/20 bg-[var(--color-surface-200)] text-[var(--chart-1)] focus:ring-[var(--chart-1)]"
                        />
                        LISS Cardio 🏃
                    </label>
                    <label className="flex items-center gap-2 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors cursor-pointer select-none">
                        <input
                            type="checkbox"
                            checked={didStretch}
                            onChange={(e) => setDidStretch(e.target.checked)}
                            disabled={isLoading}
                            className="w-4 h-4 rounded border-white/20 bg-[var(--color-surface-200)] text-[var(--chart-1)] focus:ring-[var(--chart-1)]"
                        />
                        Stretching 🧎
                    </label>
                </div>

                <div className="flex gap-3 pt-2 border-t border-[var(--border)]">
                    <input
                        type="text"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="Optional notes (e.g. massage, sauna)..."
                        disabled={isLoading}
                        className="glass-input flex-1 px-3 py-1.5 text-sm text-[var(--foreground)]"
                    />
                    <button
                        type="submit"
                        disabled={isLoading || !date}
                        className="btn-primary text-sm"
                    >
                        {isLoading ? "Saving..." : "Log Rest Day"}
                    </button>
                </div>
            </div>
        </form>
    );
}
