// One before/after photo slot (S2.2): file input + preview + remove, with the
// shared 4 MB cap. Replaces the near-identical slot blocks in LogMealModal.
import { useCallback, useState } from "react";
import type { ChangeEvent } from "react";

/** Binary cap before base64 encoding (server accepts up to 8M base64 chars). */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** Attached photo kept as base64 (for interpret) + data URL (for the preview). */
export interface AttachedImage {
    base64: string;
    dataUrl: string;
}

/** Module-local (un-exported to keep this file a component-only module): base64 for interpret + data URL for the preview. */
function readFileAsImage(file: File): Promise<AttachedImage> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = String(reader.result);
            // Strip the data: prefix — the API wants raw base64.
            const comma = dataUrl.indexOf(",");
            resolve({ base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl, dataUrl });
        };
        reader.onerror = () => reject(new Error("Could not read the file"));
        reader.readAsDataURL(file);
    });
}

interface ImageSlotProps {
    /** Slot title, e.g. "Before photo" — also drives the preview alt text. */
    label: string;
    required?: boolean;
    /** Small helper line under the input (e.g. "After eating — leftovers/broth"). */
    hint?: string;
    /** aria-label for the file input; also used for the remove button. */
    inputLabel: string;
    image: AttachedImage | null;
    onAttach: (image: AttachedImage) => void;
    onRemove: () => void;
    onError: (message: string | null) => void;
}

export default function ImageSlot({
    label,
    required = false,
    hint,
    inputLabel,
    image,
    onAttach,
    onRemove,
    onError,
}: ImageSlotProps) {
    const [fileName, setFileName] = useState<string | null>(null);

    const handleFile = useCallback(
        async (e: ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // allow re-picking the same file
            if (!file) return;
            if (file.size > MAX_IMAGE_BYTES) {
                onError(`"${file.name}" is over 4 MB — pick a smaller image.`);
                return;
            }
            onError(null);
            try {
                onAttach(await readFileAsImage(file));
                setFileName(file.name);
            } catch {
                onError("Could not read that file — try another image.");
            }
        },
        [onAttach, onError],
    );

    const removeImage = useCallback(() => {
        setFileName(null);
        onRemove();
    }, [onRemove]);

    return (
        <div>
            <label className="text-xs text-white font-medium block mb-1.5">
                {label} {required ? "*" : <span className="text-surface-400">(optional)</span>}
            </label>
            {/* Whole slot is the click target — the bare native input was invisible
                on the dark glass background (no border, 5% white button). */}
            <label className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-surface-300/40 bg-white/[0.02] px-3 py-2.5 cursor-pointer hover:bg-white/[0.05] transition-colors">
                <span className="text-xs truncate">
                    {fileName ?? <span className="text-surface-400">Tap to choose an image…</span>}
                </span>
                <span className="text-xs font-medium text-emerald-400 shrink-0">
                    {fileName ? "Change" : "Browse"}
                </span>
                <input
                    type="file"
                    accept="image/*"
                    aria-label={inputLabel}
                    onChange={handleFile}
                    className="sr-only"
                />
            </label>
            {hint && <p className="text-[11px] text-surface-400 mt-1.5">{hint}</p>}
            {image && (
                <div className="mt-2 flex items-center gap-2">
                    <img
                        src={image.dataUrl}
                        alt={`${label} preview`}
                        className="h-20 w-20 rounded-lg object-cover border border-surface-300/30"
                    />
                    <button
                        type="button"
                        onClick={removeImage}
                        className="text-xs text-red-400/70 hover:text-red-400"
                        aria-label={`Remove ${inputLabel}`}
                    >
                        Remove
                    </button>
                </div>
            )}
        </div>
    );
}
