import { useState, useRef, useEffect } from "react";
import { CalendarDays } from "lucide-react";
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
import { toYMD, fromYMD } from "@/lib/date-utils";

interface DatePickerProps {
  value: string; // "YYYY-MM-DD"
  onChange: (ymd: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
}

export default function DatePicker({ value, onChange, disabled = false, id, className = "" }: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const formatted = fromYMD(value).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div ref={popRef} className="relative inline-flex">
      <button
        type="button"
        id={id}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] px-2 py-1 rounded cursor-pointer transition-colors outline-none focus:ring-1 focus:ring-[var(--color-accent-400)] disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        <CalendarDays className="w-3.5 h-3.5" />
        <span>{formatted}</span>
      </button>
      {open && (
        <div
          className="absolute top-full left-0 mt-1.5 z-50 bg-[var(--card)] border border-[var(--border)] rounded-xl p-2.5"
          style={{
            boxShadow: "0 20px 50px rgba(0,0,0,.5)",
            ...{
              "--rdp-accent-color": "var(--color-accent-400)",
              "--rdp-accent-background-color": "oklch(0.72 0.19 160 / 0.12)",
              "--rdp-today-color": "var(--color-glow-cyan)",
              "--rdp-day-width": "36px",
              "--rdp-day-height": "36px",
              "--rdp-nav-button-width": "32px",
              "--rdp-nav-button-height": "32px",
              "--rdp-font-family": "inherit",
            } as React.CSSProperties,
          }}
        >
          <DayPicker
            mode="single"
            selected={fromYMD(value)}
            defaultMonth={fromYMD(value)}
            onSelect={(d) => {
              if (d) {
                onChange(toYMD(d));
                setOpen(false);
              }
            }}
          />
        </div>
      )}
    </div>
  );
}
