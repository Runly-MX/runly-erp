import { useContext, useEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  ExternalLink,
  FastForward,
  FlipVertical2,
  FlipHorizontal2,
  Link2,
  Loader2,
  Maximize,
  MoreHorizontal,
  PanelRight,
  Pencil,
  UserRound,
  Play,
  RefreshCw,
  Rewind,
  RotateCcw,
  RotateCw,
  Share2,
  VolumeX,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuTrigger,
} from "./ContextMenu.jsx";
import { getOfficeFormat } from "@runly/core/browser";
import { getFileKind, formatBytes } from "../lib/file-kind";
import { useHlsPlayback } from "../lib/useHlsPlayback";
import {
  canShareFiles,
  copyViewerImage,
  copyViewerLink,
  downloadViewerFile,
  seekMedia,
  shareViewerFile,
  toggleMediaFullscreen,
  toggleMediaMute,
  toggleMediaPlay,
} from "../lib/viewer-file-actions.js";
import { FileVisual } from "./FileVisual";
import { PDFViewer } from "./PDFViewer";
import { XmlPreview, ZipPreview, isZipFile } from "./FilePreviewPanels";
import { ViewerActionsSheet } from "./ViewerActionsSheet.jsx";
import { ViewerFilmstrip } from "./ViewerFilmstrip.jsx";
import { ViewerImageToolbar } from "./ViewerImageToolbar.jsx";
import { ViewerGenericPreview } from "./ViewerGenericPreview.jsx";
import { ImageEditorDialog } from "./ImageEditorDialog.jsx";
import { ViewerImageEditingContext } from "../lib/viewer-image-editing.js";
import { useCoarsePointer } from "../hooks/usePointerCapabilities.js";
import { useViewerTouchGestures } from "../hooks/useViewerTouchGestures.js";
import { MAX_ZOOM, MIN_ZOOM, useViewerImageTransform } from "../hooks/useViewerImageTransform.js";
import { shortcutLabel, useViewerShortcuts, withShortcut } from "../hooks/useViewerShortcuts.js";

const HLS_MIME_TYPES = new Set(["application/vnd.apple.mpegurl", "application/x-mpegurl"]);

// Resolve real thumbnails for image/video files within +/-3 of the active
// index only — resolving+loading a whole 21-item gallery at once is exactly
// the loading cost the filmstrip must avoid. Farther files show the generic
// file icon until they enter the window.
const THUMB_WINDOW = 3;

export function AdvancedFileViewer({
  open,
  onOpenChange,
  files,
  activeIndex,
  onIndexChange,
  onResolveSignedUrl,
  zIndex = 50,
  onOpenInOffice = null,
  canOpenInOffice = null,
  // Image editing. By default the viewer uses the app-wide
  // ViewerImageEditingContext ({ saveCopy, replace }, each (editedFile,
  // sourceFile) => Promise that throws on failure) and shows an "Editar" button
  // on images. A host can override either handler with these props, or turn the
  // feature off for files that are not editable images (chat, avatars...).
  imageEditing = true,
  onSaveEditedImage = null,
  onReplaceEditedImage = null,
  editedImageSaveLabel = "Guardar copia",
  // Generic opt-in: (file) => void. Shows the same "Editar imagen" button for
  // any image and lets the host open its own editor (images that are not
  // FileAsset rows, e.g. public storage URLs).
  onEditImage = null,
  // (file, { getMedia }) => ReactNode | null. For videos: a panel shown beside
  // (or below, on narrow screens) the player, e.g. a synced transcript. `getMedia()`
  // returns the live <video>. The viewer adds the show/hide toggle.
  renderSidePanel = null,
}) {
  const editing = useContext(ViewerImageEditingContext);
  const saveCopyHandler = onSaveEditedImage ?? editing?.saveCopy ?? null;
  const replaceHandler = onReplaceEditedImage ?? editing?.replace ?? null;
  // (sourceFile, signedUrl) => void: opens the profile-photo framing for this image.
  const avatarHandler = editing?.setAsAvatar ?? null;
  const [editorOpen, setEditorOpen] = useState(false);
  // Edited content shown straight from the editor's output (blob URLs), so the
  // new image appears even if the host caches the old signed URL.
  const [localUrls, setLocalUrls] = useState({});
  const localUrlsRef = useRef(localUrls);
  localUrlsRef.current = localUrls;
  useEffect(() => () => Object.values(localUrlsRef.current).forEach((u) => URL.revokeObjectURL(u)), []);
  const [signedUrl, setSignedUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [filmstripOpen, setFilmstripOpen] = useState(true);
  const [mediaThumbUrls, setMediaThumbUrls] = useState({});
  const [actionsOpen, setActionsOpen] = useState(false);
  const [chromeHidden, setChromeHidden] = useState(false);
  const [hlsDownloading, setHlsDownloading] = useState(false);
  const [sidePanelOpen, setSidePanelOpen] = useState(true);

  // Touch: the content area receives the gestures; `slideRef` is what moves
  // when swiping between files or down to close.
  const surfaceRef = useRef(null);
  const slideRef = useRef(null);
  const contentRef = useRef(null);
  const hlsVideoRef = useRef(null);
  const mediaRef = useRef(null);
  const mediaThumbFetching = useRef(new Set());
  const coarse = useCoarsePointer();

  const file = files?.[activeIndex] ?? null;
  const kind = useMemo(() => getFileKind(file), [file]);
  const t = useViewerImageTransform({ resetKey: file?.id });
  // HLS sources (runly.chat call recordings, via a blob: URL wrapping a
  // rewritten manifest — see ChatRecordingsGallery.jsx) can't use a plain
  // <video src>: hls.js has to demux the stream itself.
  const isHlsSource = kind === "video" && HLS_MIME_TYPES.has(String(file?.mimeType ?? "").toLowerCase());
  useHlsPlayback(hlsVideoRef, !loading && signedUrl && isHlsSource ? signedUrl : null);
  const officeOpenable = useMemo(() => {
    if (!onOpenInOffice || !file) return false;
    if (canOpenInOffice && !canOpenInOffice(file)) return false;
    return Boolean(
      getOfficeFormat({
        originalName: file.originalName ?? file.fileName ?? file.name ?? "",
        mimeType: file.mimeType ?? "",
      }),
    );
  }, [onOpenInOffice, canOpenInOffice, file]);
  const multi = (files?.length ?? 0) > 1;
  const canPrev = activeIndex > 0;
  const canNext = activeIndex >= 0 && activeIndex < files.length - 1;

  // Only the current file's own cached URL, not the whole mediaThumbUrls map,
  // so the effect below isn't invalidated every time some other file's
  // filmstrip thumbnail resolves in the background — that used to
  // cancel-and-restart the active file's own fetch on every unrelated
  // resolution, which with many files could keep it from ever finishing.
  const cachedActiveUrl = file?.id ? (localUrls[file.id] ?? mediaThumbUrls[file.id] ?? null) : null;

  useEffect(() => {
    let active = true;
    if (!open || !file?.id) {
      setSignedUrl(null);
      return () => {
        active = false;
      };
    }
    // Reuse the filmstrip resolver's URL so paging to an adjacent file (the
    // common case) swaps instantly with no spinner flash.
    if (cachedActiveUrl) {
      setSignedUrl(cachedActiveUrl);
      setLoading(false);
      return () => {
        active = false;
      };
    }
    (async () => {
      try {
        setLoading(true);
        const url = await onResolveSignedUrl(file);
        if (active) setSignedUrl(url || null);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [open, file?.id, onResolveSignedUrl, cachedActiveUrl]);

  useEffect(() => {
    if (!open || !filmstripOpen || !onResolveSignedUrl || !multi) return;
    const start = Math.max(0, activeIndex - THUMB_WINDOW);
    const end = Math.min(files.length - 1, activeIndex + THUMB_WINDOW);
    for (let i = start; i <= end; i++) {
      const f = files[i];
      if (!f) continue;
      const fKind = getFileKind(f);
      if (fKind !== "video" && fKind !== "image") continue;
      // Images that already carry a pre-built thumbnailUrl never need this
      // network round trip.
      if (fKind === "image" && f.thumbnailUrl) continue;
      if (mediaThumbUrls[f.id] || mediaThumbFetching.current.has(f.id)) continue;
      mediaThumbFetching.current.add(f.id);
      // onResolveSignedUrl may be sync (a blob-URL resolver) or async —
      // normalise so a plain string / null return never throws out of this
      // effect (which the app-level ErrorBoundary would surface as a
      // full-screen "SIN CONEXION").
      Promise.resolve(onResolveSignedUrl(f))
        .then((url) => {
          if (url) setMediaThumbUrls((prev) => ({ ...prev, [f.id]: url }));
        })
        .finally(() => {
          mediaThumbFetching.current.delete(f.id);
        });
    }
    // mediaThumbUrls intentionally omitted: it's only read as an
    // already-fetched guard; mediaThumbFetching prevents duplicate requests.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeIndex, files, filmstripOpen, onResolveSignedUrl]);

  // Latest transform state for the imperative Touch Events handlers —
  // a ref so per-frame reads never force the hook to re-bind its listeners.
  const liveRef = useRef({});
  liveRef.current = { zoom: t.zoom, pan: t.pan, clampPan: t.clampPan };

  // Touch gestures (long press -> actions sheet, swipe between files, swipe
  // down to close, tap to hide the chrome, and for images pinch/pan/double
  // tap). PDF, video and scrolling previews keep their own native touch
  // handling; their actions are in the top bar's "⋯".
  const touchSurface = !(kind === "pdf" || kind === "video" || kind === "xml" || (kind === "archive" && isZipFile(file)));
  useViewerTouchGestures({
    surfaceRef,
    slideRef,
    enabled: Boolean(open && coarse && touchSurface),
    zoomable: kind === "image" && Boolean(signedUrl) && !loading,
    live: liveRef,
    setZoom: t.setZoom,
    setPan: t.setPan,
    setPinching: t.setPinching,
    setDragging: t.setDragging,
    canPrev,
    canNext,
    minZoom: MIN_ZOOM,
    maxZoom: MAX_ZOOM,
    onNavigate: (dir) => onIndexChange(activeIndex + dir),
    onClose: () => onOpenChange(false),
    onLongPress: () => setActionsOpen(true),
    onTap: () => setChromeHidden((v) => !v),
    onDoubleTapZoom: () => { t.suppressDblClickRef.current = Date.now(); },
    deps: [kind, signedUrl, loading, activeIndex],
  });
  useEffect(() => {
    if (!open) { setChromeHidden(false); setActionsOpen(false); }
  }, [open]);
  const hideChrome = coarse && chromeHidden;
  const chromeCls = hideChrome ? "opacity-0 pointer-events-none" : "opacity-100";
  const barBtn = [
    coarse ? "h-10 w-10" : "h-7 w-7",
    "rounded-lg flex items-center justify-center transition-all duration-150",
    "text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]",
    "disabled:opacity-30 disabled:cursor-not-allowed",
  ].join(" ");

  async function downloadCurrent() {
    if (!signedUrl || !file) return;
    if (isHlsSource) setHlsDownloading(true);
    try {
      await downloadViewerFile({ signedUrl, file, isHls: isHlsSource });
    } finally {
      setHlsDownloading(false);
    }
  }
  const copyImage = () => signedUrl && kind === "image" && copyViewerImage(signedUrl);
  const copyLink = () => signedUrl && copyViewerLink(signedUrl);
  const shareFile = () => signedUrl && file && shareViewerFile({ signedUrl, file });
  const openExternal = () => signedUrl && window.open(signedUrl, "_blank");
  const getMedia = () => (isHlsSource ? hlsVideoRef.current : mediaRef.current);
  const goTo = (index) => index >= 0 && index < files.length && onIndexChange(index);

  const canEditImage =
    imageEditing && Boolean(saveCopyHandler || replaceHandler) && kind === "image" && /^[0-9a-f-]{36}$/i.test(String(file?.id ?? ""));
  const hostEditsImage = kind === "image" && typeof onEditImage === "function";
  const editImage = () => (canEditImage ? setEditorOpen(true) : onEditImage?.(file));
  const showEditImage = canEditImage || hostEditsImage;
  const isMedia = kind === "video" || kind === "audio";
  const mediaReady = Boolean(signedUrl) && !loading;
  const actions = [
    kind === "image" && { key: "copy", shortcut: "copy", group: "file", label: "Copiar imagen", icon: Copy, onSelect: copyImage, disabled: !signedUrl },
    { key: "download", shortcut: "download", group: "file", label: isHlsSource ? "Descargar MP4" : "Descargar", icon: Download, onSelect: downloadCurrent, disabled: !signedUrl || hlsDownloading },
    canShareFiles && !isHlsSource && { key: "share", group: "file", label: "Compartir", icon: Share2, onSelect: shareFile, disabled: !signedUrl },
    !isHlsSource && { key: "link", shortcut: "link", group: "file", label: "Copiar enlace", icon: Link2, onSelect: copyLink, disabled: !signedUrl },
    !isHlsSource && { key: "open", shortcut: "open", group: "file", label: "Abrir en pestaña nueva", icon: ExternalLink, onSelect: openExternal, disabled: !signedUrl },
    kind === "image" && avatarHandler && { key: "avatar", group: "image", label: "Usar como foto de perfil", icon: UserRound, onSelect: () => avatarHandler(file, signedUrl), disabled: !signedUrl },
    kind === "image" && showEditImage && { key: "edit", group: "image", label: "Editar imagen", icon: Pencil, onSelect: editImage, disabled: !signedUrl },
    kind === "image" && { key: "zoomin", shortcut: "zoomin", group: "image", label: "Acercar", icon: ZoomIn, onSelect: () => t.nudgeZoom(1), disabled: t.zoom >= MAX_ZOOM },
    kind === "image" && { key: "zoomout", shortcut: "zoomout", group: "image", label: "Alejar", icon: ZoomOut, onSelect: () => t.nudgeZoom(-1), disabled: t.zoom <= MIN_ZOOM },
    kind === "image" && { key: "rotl", shortcut: "rotl", group: "image", label: "Rotar a la izquierda", icon: RotateCcw, onSelect: () => t.setRotation((v) => v - 90) },
    kind === "image" && { key: "rotr", shortcut: "rotr", group: "image", label: "Rotar a la derecha", icon: RotateCw, onSelect: () => t.setRotation((v) => v + 90) },
    kind === "image" && { key: "fliph", shortcut: "fliph", group: "image", label: "Voltear horizontal", icon: FlipVertical2, onSelect: () => t.setFlipX((v) => !v) },
    kind === "image" && { key: "flipv", shortcut: "flipv", group: "image", label: "Voltear vertical", icon: FlipHorizontal2, onSelect: () => t.setFlipY((v) => !v) },
    kind === "image" && { key: "reset", shortcut: "reset", group: "image", label: "Restablecer vista", icon: RefreshCw, onSelect: t.resetTransforms },
    isMedia && { key: "play", shortcut: "play", group: "media", label: "Reproducir / pausar", icon: Play, onSelect: () => toggleMediaPlay(getMedia()), disabled: !mediaReady },
    isMedia && { key: "back", shortcut: "back", group: "media", label: "Retroceder 10 s", icon: Rewind, onSelect: () => seekMedia(getMedia(), -10), disabled: !mediaReady },
    isMedia && { key: "fwd", shortcut: "fwd", group: "media", label: "Adelantar 10 s", icon: FastForward, onSelect: () => seekMedia(getMedia(), 10), disabled: !mediaReady },
    isMedia && { key: "mute", shortcut: "mute", group: "media", label: "Silenciar / activar sonido", icon: VolumeX, onSelect: () => toggleMediaMute(getMedia()), disabled: !mediaReady },
    kind === "video" && { key: "fullscreen", shortcut: "fullscreen", group: "media", label: "Pantalla completa", icon: Maximize, onSelect: () => toggleMediaFullscreen(getMedia()), disabled: !mediaReady },
    multi && { key: "prev", shortcut: "prev", group: "nav", label: "Archivo anterior", icon: ChevronLeft, onSelect: () => goTo(activeIndex - 1), disabled: !canPrev },
    multi && { key: "next", shortcut: "next", group: "nav", label: "Archivo siguiente", icon: ChevronRight, onSelect: () => goTo(activeIndex + 1), disabled: !canNext },
  ].filter(Boolean);
  useViewerShortcuts({ enabled: open, containerRef: contentRef, actions });

  const ready = !loading && Boolean(signedUrl);
  const sidePanel = kind === "video" && renderSidePanel ? renderSidePanel(file, { getMedia }) : null;
  const hasInlinePreview = ["image", "pdf", "video", "audio", "xml"].includes(kind) || (kind === "archive" && isZipFile(file));
  const focusPanel = (e) => {
    e.preventDefault();
    contentRef.current?.focus({ preventScroll: true });
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          style={{ zIndex }}
          className="fixed inset-0 bg-black/20 dark:bg-black/40 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 duration-200"
        />

        {/* Viewer panel — fills the viewport. It takes focus itself on open
            (not its first button) so the shortcuts work right away and
            Space/Enter never "click" a toolbar button the user didn't pick. */}
        <DialogPrimitive.Content
          ref={contentRef}
          tabIndex={-1}
          aria-describedby={undefined}
          style={{ zIndex }}
          onOpenAutoFocus={focusPanel}
          onPointerDownOutside={(e) => {
            // Prevent accidental close during pinch/pan gestures
            if (t.gestureRef.current.mode !== null) e.preventDefault();
          }}
          className={[
            "fixed inset-0 flex flex-col overflow-hidden outline-none",
            "glass-viewer",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "duration-200",
          ].join(" ")}
        >
          {/* ── TOP BAR ─────────────────────────────────── */}
          <div className={`flex items-center gap-2 px-3 ${coarse ? "h-14" : "h-12"} safe-top shrink-0 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-2))]/60 transition-opacity duration-200 ${chromeCls}`}>
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <FileVisual file={file} previewUrl={null} className="h-6 w-6 shrink-0 rounded opacity-80" />
              <div className="flex items-baseline gap-2 min-w-0">
                <DialogPrimitive.Title className="text-[13px] font-medium text-[hsl(var(--foreground))] truncate">
                  {file?.originalName ?? "Vista de archivo"}
                </DialogPrimitive.Title>
                {file?.sizeBytes > 0 && (
                  <span className="text-[11px] text-[hsl(var(--muted-foreground))]/70 shrink-0 hidden sm:inline tabular-nums">
                    {formatBytes(file.sizeBytes)}
                  </span>
                )}
              </div>
            </div>

            {multi && (
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={() => goTo(activeIndex - 1)} disabled={!canPrev} aria-label="Archivo anterior" title={withShortcut("Anterior", "prev")} className={barBtn}>
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <span className="text-[11px] text-[hsl(var(--muted-foreground))]/70 min-w-11 text-center tabular-nums select-none">
                  {activeIndex + 1} / {files.length}
                </span>
                <button onClick={() => goTo(activeIndex + 1)} disabled={!canNext} aria-label="Archivo siguiente" title={withShortcut("Siguiente", "next")} className={barBtn}>
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}

            <div className="flex items-center gap-0.5 shrink-0">
              {/* Open-external/share assume `signedUrl` is a real, fetchable
                  resource. For an HLS source it's a blob: URL wrapping
                  manifest TEXT — opening/sharing it would hand the user
                  "#EXTM3U..." mislabeled as a video. Download stays: it
                  remuxes HLS to a real .mp4 client-side. */}
              {sidePanel && (
                <button
                  onClick={() => setSidePanelOpen((v) => !v)}
                  aria-label={sidePanelOpen ? "Ocultar panel lateral" : "Mostrar panel lateral"}
                  aria-pressed={sidePanelOpen}
                  title={sidePanelOpen ? "Ocultar transcripción" : "Mostrar transcripción"}
                  className={barBtn}
                >
                  <PanelRight className="h-3.5 w-3.5" />
                </button>
              )}
              {!isHlsSource && !coarse && (
                <button onClick={openExternal} disabled={!signedUrl} aria-label="Abrir en pestaña nueva" title={withShortcut("Abrir externo", "open")} className={barBtn}>
                  <ExternalLink className="h-3.5 w-3.5" />
                </button>
              )}
              {kind === "image" && avatarHandler && !coarse && (
                <button onClick={() => avatarHandler(file, signedUrl)} disabled={!signedUrl} aria-label="Usar como foto de perfil" title="Usar como foto de perfil" className={barBtn}>
                  <UserRound className="h-3.5 w-3.5" />
                </button>
              )}
              {showEditImage && !coarse && (
                <button onClick={editImage} disabled={!signedUrl} aria-label="Editar imagen" title="Editar imagen" className={barBtn}>
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              )}
              {kind === "image" && !coarse && (
                <button onClick={copyImage} disabled={!signedUrl} aria-label="Copiar imagen" title={withShortcut("Copiar imagen", "copy")} className={barBtn}>
                  <Copy className="h-3.5 w-3.5" />
                </button>
              )}
              <button
                onClick={downloadCurrent}
                disabled={!signedUrl || hlsDownloading}
                aria-label={isHlsSource ? "Descargar como MP4" : "Descargar archivo"}
                title={withShortcut(isHlsSource ? "Descargar como MP4, se genera en tu navegador" : "Descargar", "download")}
                className={barBtn}
              >
                {hlsDownloading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              </button>
              {canShareFiles && !isHlsSource && !coarse && (
                <button onClick={shareFile} disabled={!signedUrl} aria-label="Compartir archivo" title="Compartir" className={barBtn}>
                  <Share2 className="h-3.5 w-3.5" />
                </button>
              )}
              {coarse && (
                <button onClick={() => setActionsOpen(true)} aria-label="Más acciones" title="Más acciones" className={barBtn}>
                  <MoreHorizontal className="h-5 w-5" />
                </button>
              )}
              <div className="w-px h-3.5 bg-[hsl(var(--border))] mx-1" />
              <DialogPrimitive.Close aria-label="Cerrar visor" title="Cerrar" className={barBtn}>
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>
          </div>

          {/* ── CONTENT AREA ────────────────────────────── */}
          {/* Right-click (desktop) anywhere over the file surface opens the
              Runly context menu instead of the browser's native one. Item
              list adapts to the current file kind. */}
          <ContextMenu>
            <ContextMenuTrigger asChild disabled={coarse}>
              <div
                ref={surfaceRef}
                className={`relative flex-1 min-h-0 overflow-hidden ${coarse ? "select-none [-webkit-touch-callout:none]" : ""}`}
              >
                {/* Everything that moves with a swipe (prev/next, swipe-down close). */}
                <div ref={slideRef} className="absolute inset-0 will-change-transform">
                  {loading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Loader2 className="h-7 w-7 animate-spin text-[hsl(var(--muted-foreground))]/50" />
                    </div>
                  )}

                  {!loading && !signedUrl && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                      <div className="h-14 w-14 rounded-2xl bg-[hsl(var(--muted))] flex items-center justify-center border border-[hsl(var(--border))]">
                        <FileVisual file={file} previewUrl={null} className="h-7 w-7 opacity-40" />
                      </div>
                      <p className="text-xs text-[hsl(var(--muted-foreground))]/70">Sin vista previa disponible.</p>
                    </div>
                  )}

                  {ready && kind === "image" && (
                    <div
                      ref={t.containerRef}
                      className={`h-full w-full overflow-hidden flex items-center justify-center touch-none select-none ${
                        t.dragging ? "cursor-grabbing" : "cursor-grab"
                      }`}
                      {...t.containerHandlers}
                    >
                      <div style={t.panStyle} className="flex items-center justify-center">
                        {/* Rendered at natural size; imageStyle's scale() is the
                            fit-relative effective scale (zoom 1 == fits the
                            visible area). Hidden until measured to avoid a
                            one-frame full-resolution flash. */}
                        <img
                          src={signedUrl}
                          alt={file?.originalName ?? "Archivo"}
                          draggable={false}
                          onLoad={(e) => t.setNaturalSize({ w: e.currentTarget.naturalWidth, h: e.currentTarget.naturalHeight })}
                          className="will-change-transform block [-webkit-touch-callout:none]"
                          style={{ ...t.imageStyle, visibility: t.naturalSize ? "visible" : "hidden" }}
                        />
                      </div>
                    </div>
                  )}

                  {ready && kind === "pdf" && <PDFViewer url={signedUrl} />}

                  {/* HLS: hls.js/native attaches via useHlsPlayback above, no src prop. */}
                  {ready && kind === "video" && (
                    <div className={`h-full w-full flex ${sidePanel && sidePanelOpen ? "flex-col md:flex-row" : ""}`}>
                    <div className="flex-1 min-h-0 min-w-0 flex items-center justify-center bg-black">
                      <video
                        key={signedUrl}
                        ref={isHlsSource ? hlsVideoRef : mediaRef}
                        src={isHlsSource ? undefined : signedUrl}
                        controls
                        playsInline
                        preload="metadata"
                        className="max-h-full max-w-full"
                        style={{ outline: "none" }}
                      />
                    </div>
                    {sidePanel && sidePanelOpen && (
                      <div className="h-[45%] md:h-full md:w-[380px] shrink-0 min-h-0 border-t md:border-t-0 md:border-l border-[hsl(var(--border))] bg-[hsl(var(--background))]">
                        {sidePanel}
                      </div>
                    )}
                    </div>
                  )}

                  {ready && kind === "audio" && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-5 p-8">
                      <div className="h-20 w-20 rounded-2xl bg-[hsl(var(--muted))] flex items-center justify-center border border-[hsl(var(--border))]">
                        <FileVisual file={file} previewUrl={null} className="h-10 w-10 opacity-60" />
                      </div>
                      <p className="text-sm font-medium text-center truncate max-w-xs">
                        {file?.originalName ?? file?.name ?? "Audio"}
                      </p>
                      <audio key={signedUrl} ref={mediaRef} src={signedUrl} controls className="w-full max-w-sm" style={{ outline: "none" }} />
                    </div>
                  )}

                  {ready && kind === "xml" && <XmlPreview key={signedUrl} url={signedUrl} file={file} />}
                  {ready && kind === "archive" && isZipFile(file) && <ZipPreview key={signedUrl} url={signedUrl} file={file} />}

                  {ready && !hasInlinePreview && (
                    <ViewerGenericPreview
                      file={file}
                      kind={kind}
                      officeOpenable={officeOpenable}
                      onOpenOffice={() => {
                        onOpenChange(false);
                        onOpenInOffice(file);
                      }}
                      onDownload={downloadCurrent}
                      onOpen={openExternal}
                      onShare={canShareFiles ? shareFile : null}
                    />
                  )}
                </div>

                {/* Overlaid navigation arrows. Independent of `loading`/
                    `signedUrl` — generic chrome that must stay put while the
                    next file loads instead of flashing away and back. */}
                {multi && !coarse && (
                  <>
                    {canPrev && (
                      <button
                        onClick={() => goTo(activeIndex - 1)}
                        aria-label="Archivo anterior"
                        title={withShortcut("Anterior", "prev")}
                        className="absolute left-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl flex items-center justify-center glass text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-all duration-150"
                      >
                        <ChevronLeft className="h-5 w-5" />
                      </button>
                    )}
                    {canNext && (
                      <button
                        onClick={() => goTo(activeIndex + 1)}
                        aria-label="Archivo siguiente"
                        title={withShortcut("Siguiente", "next")}
                        className="absolute right-3 top-1/2 -translate-y-1/2 h-10 w-10 rounded-xl flex items-center justify-center glass text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] transition-all duration-150"
                      >
                        <ChevronRight className="h-5 w-5" />
                      </button>
                    )}
                  </>
                )}

                {multi && (
                  <ViewerFilmstrip
                    files={files}
                    activeIndex={activeIndex}
                    onIndexChange={onIndexChange}
                    mediaThumbUrls={mediaThumbUrls}
                    open={filmstripOpen}
                    onOpenChange={setFilmstripOpen}
                    raised={kind === "pdf"}
                    hidden={t.gestureActive || hideChrome}
                  />
                )}
              </div>
            </ContextMenuTrigger>
            <ContextMenuContent
              style={{ zIndex: zIndex + 10 }}
              data-above-viewer=""
              className="w-64"
              onCloseAutoFocus={focusPanel}
            >
              {actions.map((action, i) => (
                <div key={action.key} className="contents">
                  {i > 0 && actions[i - 1].group !== action.group && <ContextMenuSeparator />}
                  <ContextMenuItem onSelect={action.onSelect} disabled={action.disabled}>
                    <action.icon />
                    {action.label}
                    {action.shortcut && (
                      <ContextMenuShortcut className="tracking-normal">{shortcutLabel(action.shortcut)}</ContextMenuShortcut>
                    )}
                  </ContextMenuItem>
                </div>
              ))}
            </ContextMenuContent>
          </ContextMenu>

          {/* ── BOTTOM TOOLBAR ───────────────────────────── */}
          {/* Reserved at the same height once a file is loaded, so the modal's
              shape stays uniform across file kinds — only images populate it.
              Skipped for PDF: PDFViewer renders its own bottom toolbar. */}
          {ready && kind !== "pdf" && (
            <div className={`flex items-center justify-center gap-1.5 px-3 h-12 safe-bottom shrink-0 border-t border-[hsl(var(--border))] bg-[hsl(var(--surface-2))]/60 overflow-x-auto transition-opacity duration-200 ${chromeCls}`}>
              {kind === "image" && <ViewerImageToolbar t={t} />}
            </div>
          )}
          {canEditImage && (
            <ImageEditorDialog
              open={editorOpen}
              onOpenChange={setEditorOpen}
              src={signedUrl}
              fileName={file?.originalName ?? "imagen"}
              mimeType={file?.mimeType || "image/jpeg"}
              saveLabel={editedImageSaveLabel}
              onSave={
                saveCopyHandler
                  ? async (edited) => {
                      try {
                        await saveCopyHandler(edited, file);
                        setEditorOpen(false);
                      } catch {
                        // The host reports the failure; keep the editor open for a retry.
                      }
                    }
                  : null
              }
              onReplace={
                replaceHandler
                  ? async (edited) => {
                      try {
                        await replaceHandler(edited, file);
                        const url = URL.createObjectURL(edited);
                        setLocalUrls((prev) => {
                          if (prev[file.id]) URL.revokeObjectURL(prev[file.id]);
                          return { ...prev, [file.id]: url };
                        });
                        setEditorOpen(false);
                      } catch {
                        // The host reports the failure; keep the editor open for a retry.
                      }
                    }
                  : null
              }
            />
          )}
          <ViewerActionsSheet
            open={actionsOpen}
            onOpenChange={setActionsOpen}
            title={file?.originalName ?? file?.name}
            actions={actions}
            zIndex={zIndex + 10}
          />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
