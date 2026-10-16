// Shared image intake pipeline: every photo source (gallery file, camera
// frame) funnels through decode → downscale → JPEG re-encode. Oversized phone
// originals (an iPhone HEIC is regularly > 4 MB) shrink to a VLM-friendly
// payload instead of being rejected — vision providers downscale internally
// anyway, so nothing readable is lost. Also keeps the server's 8M base64-char
// request budget safe.

/** Attached photo kept as base64 (for interpret) + data URL (for the preview). */
export interface AttachedImage {
    base64: string;
    dataUrl: string;
}

const MAX_DIMENSION = 2048;
const JPEG_QUALITY = 0.85;
/** Hard guard on the re-encoded result (server accepts up to 8M base64 chars;
 * 2048px JPEG Q85 lands around 0.3–0.8 MB, so this only trips on abuse). */
const MAX_ENCODED_BYTES = 5 * 1024 * 1024;

function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error("Could not read the encoded image"));
        reader.readAsDataURL(blob);
    });
}

async function encodeToAttachedImage(
    source: CanvasImageSource,
    srcW: number,
    srcH: number,
): Promise<AttachedImage> {
    const scale = Math.min(1, MAX_DIMENSION / Math.max(srcW, srcH, 1));
    const width = Math.max(1, Math.round(srcW * scale));
    const height = Math.max(1, Math.round(srcH * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is unavailable in this browser");
    ctx.drawImage(source, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
    if (!blob) throw new Error("Could not encode the image");
    if (blob.size > MAX_ENCODED_BYTES) throw new Error("รูปใหญ่เกินไปแม้หลังย่อ — ลองรูปอื่น");
    const dataUrl = await blobToDataUrl(blob);
    const comma = dataUrl.indexOf(",");
    return { base64: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl, dataUrl };
}

/** Gallery/file path. Decodes through createImageBitmap first (respects EXIF
 *  orientation, reads HEIC on iOS Safari); falls back to an <img> element for
 *  older browsers that lack bitmap support. */
export async function processImageFile(file: File): Promise<AttachedImage> {
    try {
        const bitmap = await createImageBitmap(file);
        return await encodeToAttachedImage(bitmap, bitmap.width, bitmap.height);
    } catch (decodeErr) {
        const url = URL.createObjectURL(file);
        try {
            const img = new Image();
            img.decoding = "async";
            img.alt = "";
            img.src = url;
            await img.decode();
            return await encodeToAttachedImage(img, img.naturalWidth, img.naturalHeight);
        } catch {
            throw decodeErr instanceof Error ? decodeErr : new Error("Could not decode the image");
        } finally {
            URL.revokeObjectURL(url);
        }
    }
}

/** Live-camera path: grab the current frame from a playing <video> element. */
export async function captureVideoFrame(video: HTMLVideoElement): Promise<AttachedImage> {
    if (!video.videoWidth || !video.videoHeight) throw new Error("กล้องยังไม่พร้อม — ลองอีกครั้ง");
    return encodeToAttachedImage(video, video.videoWidth, video.videoHeight);
}
