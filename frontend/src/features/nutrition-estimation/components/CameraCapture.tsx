// Camera-first capture block (design "10 แนบรูป AI · Sheet"): a live
// viewfinder with rear/front switching plus an always-available gallery
// fallback. Captures funnel through the shared image pipeline, so oversized
// phone originals never reach the API. The shutter feeds whichever slot the
// parent routes it to; the camera stays live so an after-photo can follow.
// Graceful degradation: permission denied → message + gallery still usable;
// no mediaDevices at all → the source chips fall back to native
// <input capture> which opens the OS camera app instead.
import { useCallback, useEffect, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { Camera, Images, SwitchCamera, Zap, ZapOff } from "lucide-react";
import { captureVideoFrame, processImageFile } from "../lib/imagePipeline";
import type { AttachedImage } from "../lib/imagePipeline";

type Facing = "environment" | "user";

/** Live getUserMedia camera support (secure context + API present). */
const HAS_LIVE_CAMERA = typeof navigator !== "undefined" && Boolean(navigator.mediaDevices?.getUserMedia);

interface CameraCaptureProps {
    /** Receives the captured/picked photo (parent routes it to a slot). */
    onAttach: (image: AttachedImage) => void;
    onError: (message: string | null) => void;
}

function SourceChip({
    active,
    icon,
    label,
    onClick,
}: {
    active: boolean;
    icon: ReactNode;
    label: string;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            aria-pressed={active}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-colors ${
                active
                    ? "border-emerald-400/60 bg-emerald-500/10 text-emerald-300"
                    : "border-surface-300/40 text-surface-300 hover:bg-white/5"
            }`}
        >
            <span aria-hidden>{icon}</span>
            {label}
        </button>
    );
}

export default function CameraCapture({ onAttach, onError }: CameraCaptureProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    /** Monotonic counter — a getUserMedia whose start was superseded by a newer
     *  one must release its tracks instead of leaking the camera. */
    const startSeqRef = useRef(0);
    const galleryInputRef = useRef<HTMLInputElement>(null);
    const systemRearInputRef = useRef<HTMLInputElement>(null);
    const systemFrontInputRef = useRef<HTMLInputElement>(null);
    const [facing, setFacing] = useState<Facing>("environment");
    const [cameraOn, setCameraOn] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [hasTorch, setHasTorch] = useState(false);
    const [torchOn, setTorchOn] = useState(false);
    const [shooting, setShooting] = useState(false);

    const stopStream = useCallback(() => {
        streamRef.current?.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
    }, []);

    const currentTrack = useCallback(() => streamRef.current?.getVideoTracks()[0], []);

    // Unmount (modal closed / step changed) always releases the camera.
    useEffect(() => stopStream, [stopStream]);

    const startCamera = useCallback(
        async (want: Facing) => {
            const seq = ++startSeqRef.current;
            setCameraError(null);
            setHasTorch(false);
            setTorchOn(false);
            if (!HAS_LIVE_CAMERA) {
                // Falls back to the native <input capture> hidden inputs —
                // the OS camera app opens instead of an in-page viewfinder.
                (want === "user" ? systemFrontInputRef : systemRearInputRef).current?.click();
                return;
            }
            stopStream();
            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    video: { facingMode: want, width: { ideal: 2560 }, height: { ideal: 1440 } },
                    audio: false,
                });
                if (seq !== startSeqRef.current) {
                    // Superseded by a newer start while awaiting — release immediately.
                    stream.getTracks().forEach((t) => t.stop());
                    return;
                }
                streamRef.current = stream;
                setFacing(want);
                setCameraOn(true);
                const video = videoRef.current;
                if (video) {
                    video.srcObject = stream;
                    void video.play().catch(() => {});
                }
                const track = currentTrack();
                const caps = track?.getCapabilities?.() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
                setHasTorch(Boolean(caps?.torch));
            } catch (err) {
                setCameraOn(false);
                setCameraError(
                    err instanceof DOMException && (err.name === "NotAllowedError" || err.name === "SecurityError")
                        ? "ไม่ได้รับอนุญาตให้ใช้กล้อง — เปิดสิทธิ์ในเบราว์เซอร์ หรือเลือกรูปจากแกลเลอรีแทน"
                        : "เปิดกล้องไม่สำเร็จ — ลองอีกครั้ง หรือเลือกรูปจากแกลเลอรีแทน",
                );
            }
        },
        [stopStream, currentTrack],
    );

    const handleShutter = useCallback(async () => {
        const video = videoRef.current;
        if (!video || !cameraOn || shooting) return;
        setShooting(true);
        try {
            onAttach(await captureVideoFrame(video));
            onError(null);
        } catch (err) {
            onError(err instanceof Error ? err.message : "ถ่ายรูปไม่สำเร็จ — ลองอีกครั้ง");
        } finally {
            setShooting(false);
        }
    }, [cameraOn, shooting, onAttach, onError]);

    const handlePickedFile = useCallback(
        async (e: ChangeEvent<HTMLInputElement>) => {
            const file = e.target.files?.[0];
            e.target.value = ""; // allow re-picking the same file
            if (!file) return;
            try {
                onAttach(await processImageFile(file));
                onError(null);
            } catch (err) {
                onError(err instanceof Error ? err.message : "อ่านรูปไม่สำเร็จ — ลองรูปอื่น");
            }
        },
        [onAttach, onError],
    );

    const toggleTorch = useCallback(async () => {
        const track = currentTrack();
        if (!track) return;
        const next = !torchOn;
        try {
            await track.applyConstraints({ advanced: [{ torch: next }] } as unknown as MediaTrackConstraints);
            setTorchOn(next);
        } catch {
            setHasTorch(false);
        }
    }, [torchOn, currentTrack]);

    const cornerBrackets = (
        <>
            <span aria-hidden className="pointer-events-none absolute left-3 top-3 h-8 w-8 rounded-sm border-l-2 border-t-2 border-white/70" />
            <span aria-hidden className="pointer-events-none absolute right-3 top-3 h-8 w-8 rounded-sm border-r-2 border-t-2 border-white/70" />
            <span aria-hidden className="pointer-events-none absolute bottom-3 left-3 h-8 w-8 rounded-sm border-b-2 border-l-2 border-white/70" />
            <span aria-hidden className="pointer-events-none absolute bottom-3 right-3 h-8 w-8 rounded-sm border-b-2 border-r-2 border-white/70" />
        </>
    );

    return (
        <div className="space-y-3">
            {/* Source chips (design: ถ่ายกล้องหลัง / ถ่ายกล้องหน้า / แกลเลอรี) */}
            <div className="flex flex-wrap gap-2">
                <SourceChip
                    active={cameraOn && facing === "environment"}
                    icon={<Camera size={14} />}
                    label="ถ่ายกล้องหลัง"
                    onClick={() => {
                        void startCamera("environment");
                    }}
                />
                <SourceChip
                    active={cameraOn && facing === "user"}
                    icon={<SwitchCamera size={14} />}
                    label="ถ่ายกล้องหน้า"
                    onClick={() => {
                        void startCamera("user");
                    }}
                />
                <SourceChip
                    active={false}
                    icon={<Images size={14} />}
                    label="แกลเลอรี"
                    onClick={() => galleryInputRef.current?.click()}
                />
            </div>

            {/* Viewfinder */}
            <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-surface-300/30 bg-black">
                <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    muted
                    className={`h-full w-full object-cover ${cameraOn ? "" : "invisible"} ${
                        facing === "user" ? "scale-x-[-1]" : ""
                    }`}
                />
                {!cameraOn && (
                    <div className="absolute inset-0 flex items-center justify-center px-6 text-center">
                        <p role={cameraError ? "alert" : undefined} className="text-xs text-surface-400">
                            {cameraError ?? "จัดอาหารให้อยู่ในกรอบ แล้วกดปุ่มกลางเพื่อถ่าย"}
                        </p>
                    </div>
                )}
                {cornerBrackets}
            </div>

            {/* Capture controls: torch (when the track supports it) | shutter | gallery */}
            <div className="flex items-center justify-center gap-6">
                {hasTorch ? (
                    <button
                        type="button"
                        onClick={() => {
                            void toggleTorch();
                        }}
                        aria-pressed={torchOn}
                        aria-label={torchOn ? "ปิดไฟฉาย" : "เปิดไฟฉาย"}
                        className={`rounded-full border p-2.5 transition-colors ${
                            torchOn
                                ? "border-amber-400/60 bg-amber-500/10 text-amber-300"
                                : "border-surface-300/40 text-surface-300 hover:bg-white/5"
                        }`}
                    >
                        {torchOn ? <Zap size={18} /> : <ZapOff size={18} />}
                    </button>
                ) : (
                    <span className="w-[42px]" aria-hidden />
                )}
                <button
                    type="button"
                    onClick={() => {
                        void handleShutter();
                    }}
                    disabled={!cameraOn || shooting}
                    aria-label="ถ่ายรูป"
                    className="flex h-14 w-14 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition-colors hover:bg-emerald-400 disabled:opacity-50"
                >
                    <Camera size={22} aria-hidden />
                </button>
                <button
                    type="button"
                    onClick={() => galleryInputRef.current?.click()}
                    aria-label="เลือกรูปจากแกลเลอรี"
                    className="rounded-full border border-surface-300/40 p-2.5 text-surface-300 transition-colors hover:bg-white/5"
                >
                    <Images size={18} aria-hidden />
                </button>
            </div>

            <p className="text-[11px] text-surface-400">
                ภาพจะเข้าช่องรูปที่ยังว่างก่อน — รูปก่อนกิน แล้วค่อยรูปหลังกิน · ถ้ากล้องใช้ไม่ได้ ยังเลือกจากแกลเลอรีได้เสมอ
            </p>

            {/* Hidden inputs: plain gallery pick + OS-camera fallbacks for browsers
                without getUserMedia. One handler serves all three. */}
            <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                onChange={handlePickedFile}
                className="sr-only"
                aria-label="เลือกรูปจากแกลเลอรี"
            />
            <input
                ref={systemRearInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                onChange={handlePickedFile}
                className="sr-only"
                aria-label="ถ่ายด้วยกล้องหลัง (กล้องระบบ)"
            />
            <input
                ref={systemFrontInputRef}
                type="file"
                accept="image/*"
                capture="user"
                onChange={handlePickedFile}
                className="sr-only"
                aria-label="ถ่ายด้วยกล้องหน้า (กล้องระบบ)"
            />
        </div>
    );
}
