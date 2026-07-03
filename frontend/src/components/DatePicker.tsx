import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
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
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);

  // Anchor the portalled popover under the button using viewport coords.
  const reposition = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setPos({ top: r.bottom + 6, left: r.left });
  }, []);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (btnRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [open, reposition]);

  const toggleOpen = () => {
    if (!open) reposition();
    setOpen((o) => !o);
  };

  const formatted = fromYMD(value).toLocaleDateString("en-US", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  return (
    <div className="relative inline-flex">
      <button
        ref={btnRef}
        type="button"
        id={id}
        disabled={disabled}
        onClick={toggleOpen}
        className={`inline-flex items-center gap-1.5 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] px-2 py-1 rounded cursor-pointer transition-colors outline-none focus:ring-1 focus:ring-[var(--color-accent-400)] disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        <CalendarDays className="w-3.5 h-3.5" />
        <span>{formatted}</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            className="fixed z-[1000] bg-[var(--card)] border border-[var(--border)] rounded-xl p-2.5"
            style={{
              top: pos.top,
              left: pos.left,
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
          </div>,
          document.body,
        )}
    </div>
  );
}
