import { toast } from "sonner";

// File actions behind AdvancedFileViewer's toolbar, context menu, actions
// sheet and keyboard shortcuts.

export function viewerFileName(file) {
  return file?.originalName ?? file?.name ?? "archivo";
}

// Re-encodes an arbitrary image blob as PNG via an offscreen canvas. Some
// browsers only accept image/png for navigator.clipboard.write, so this is
// the fallback when the source blob's own MIME type (e.g. image/webp) is
// rejected.
function blobToPng(blob) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      canvas.getContext("2d").drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      canvas.toBlob((pngBlob) => {
        if (pngBlob) resolve(pngBlob);
        else reject(new Error("canvas toBlob failed"));
      }, "image/png");
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image decode failed"));
    };
    img.src = url;
  });
}

// `download` is silently ignored by the browser for cross-origin URLs
// (every Supabase Storage signed URL is cross-origin from this app's own
// origin) — it just navigates there instead, so a PDF opens in a new
// tab/window rather than saving to disk. Fetching the bytes first and
// downloading via a same-origin blob: URL is what actually forces a save.
// HLS sources need a real, single, playable file built first — see
// downloadHlsAsMp4's own header comment (a lossless client-side remux).
export async function downloadViewerFile({ signedUrl, file, isHls }) {
  const filename = viewerFileName(file);
  if (isHls) {
    const toastId = toast.loading("Preparando descarga (puede tardar según la duración)...");
    try {
      const { downloadHlsAsMp4 } = await import("./downloadHlsAsMp4.js");
      await downloadHlsAsMp4(signedUrl, filename);
      toast.success("Descarga lista", { id: toastId });
    } catch (err) {
      console.warn("[files] HLS -> MP4 download failed", err);
      toast.error("No se pudo generar la descarga", { id: toastId });
    }
    return;
  }
  try {
    const res = await fetch(signedUrl);
    if (!res.ok) throw new Error(`download fetch failed: ${res.status}`);
    const blobUrl = URL.createObjectURL(await res.blob());
    const anchor = document.createElement("a");
    anchor.href = blobUrl;
    anchor.download = filename;
    anchor.click();
    URL.revokeObjectURL(blobUrl);
  } catch {
    window.open(signedUrl, "_blank", "noopener,noreferrer");
  }
}

// Native right-click "copy image" is unreliable for cross-origin signed
// URLs (and unavailable at all in some webviews), so this gives users an
// explicit, always-working copy action instead.
export async function copyViewerImage(signedUrl) {
  try {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
      throw new Error("Clipboard API no disponible");
    }
    const res = await fetch(signedUrl);
    if (!res.ok) throw new Error(`copy fetch failed: ${res.status}`);
    const blob = await res.blob();
    try {
      await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
    } catch {
      const pngBlob = await blobToPng(blob);
      await navigator.clipboard.write([new ClipboardItem({ "image/png": pngBlob })]);
    }
    toast.success("Imagen copiada al portapapeles");
  } catch (err) {
    console.warn("[files] copy image to clipboard failed", err);
    toast.error("No se pudo copiar la imagen");
  }
}

// Signed URLs expire (~1h), so this is a "paste it somewhere in the next
// hour" convenience, not a permanent link.
export async function copyViewerLink(signedUrl) {
  try {
    await navigator.clipboard.writeText(signedUrl);
    toast.success("Enlace copiado al portapapeles");
  } catch (err) {
    console.warn("[files] copy link to clipboard failed", err);
    toast.error("No se pudo copiar el enlace");
  }
}

export const canShareFiles = typeof navigator !== "undefined" && typeof navigator.share === "function";

// Web Share API — mainly useful on mobile (native share sheet). Tries to
// share the actual file first (so e.g. WhatsApp/Mail get a real
// attachment); falls back to sharing the link when the browser can't share
// files.
export async function shareViewerFile({ signedUrl, file }) {
  const filename = viewerFileName(file);
  try {
    const res = await fetch(signedUrl);
    if (res.ok) {
      const blob = await res.blob();
      const shareFile = new File([blob], filename, { type: blob.type });
      if (navigator.canShare?.({ files: [shareFile] })) {
        await navigator.share({ files: [shareFile], title: filename });
        return;
      }
    }
  } catch (err) {
    if (err?.name === "AbortError") return;
    console.warn("[files] share as file failed, falling back to link", err);
  }
  try {
    await navigator.share({ url: signedUrl, title: filename });
  } catch (err) {
    if (err?.name === "AbortError") return;
    console.warn("[files] share link failed", err);
    toast.error("No se pudo compartir el archivo");
  }
}

// Video/audio controls for the shortcuts and the context menu; the native
// <video controls> stays the primary UI.
export function toggleMediaPlay(media) {
  if (!media) return;
  if (media.paused) media.play().catch(() => {});
  else media.pause();
}

export function seekMedia(media, seconds) {
  if (!media) return;
  const end = Number.isFinite(media.duration) ? media.duration : Infinity;
  media.currentTime = Math.max(0, Math.min(end, media.currentTime + seconds));
}

export function toggleMediaMute(media) {
  if (media) media.muted = !media.muted;
}

export function toggleMediaFullscreen(media) {
  if (document.fullscreenElement) {
    document.exitFullscreen?.().catch(() => {});
    return;
  }
  media?.requestFullscreen?.().catch(() => {});
}
