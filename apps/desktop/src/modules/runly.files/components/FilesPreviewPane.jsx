import { useEffect, useState } from "react";
import { Button, FileVisual, formatBytes, formatDate, getFileKind, getKindLabel } from "@runly/ui";
import { Download, Folder, Info, MousePointerClick, PanelRightClose, Share2 } from "lucide-react";
import { childrenOf, folderPath } from "../lib/folders";
import { usePaneWidth } from "../hooks/usePaneWidth";

function Row({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-[hsl(var(--border))]/60 py-1.5 text-sm last:border-0">
      <span className="shrink-0 text-xs text-[hsl(var(--muted-foreground))]">{label}</span>
      <span className="break-words text-right">{value || "—"}</span>
    </div>
  );
}

// Big preview of the file itself: image, video, audio or PDF straight from a
// signed URL; anything else shows its kind tile.
function FilePreview({ file, resolveUrl, onOpen }) {
  const [url, setUrl] = useState(null);
  const mime = String(file.mimeType ?? "");
  const previewable = /^(image|video|audio)\//.test(mime) || mime === "application/pdf";
  useEffect(() => {
    let cancelled = false;
    setUrl(null);
    if (previewable) resolveUrl(file).then((next) => !cancelled && setUrl(next)).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [file.id, previewable]); // eslint-disable-line react-hooks/exhaustive-deps
  const frame = "flex min-h-56 max-h-[calc(100vh-22rem)] w-full items-center justify-center overflow-hidden rounded-xl bg-[hsl(var(--muted))]/60";
  if (!previewable || file.enabled === false)
    return (
      <div className={frame}>
        <FileVisual file={file} className="h-24 w-24 rounded-2xl" />
      </div>
    );
  if (!url) return <div className={`${frame} animate-pulse`} aria-label="Cargando vista previa" />;
  if (mime.startsWith("image/")) return <div className={frame}><img src={url} alt={file.originalName} onClick={onOpen} title="Abrir" className="max-h-[calc(100vh-22rem)] w-full cursor-zoom-in object-contain" /></div>;
  if (mime.startsWith("video/")) return <div className={frame}><video src={url} controls className="max-h-[calc(100vh-22rem)] w-full" /></div>;
  if (mime.startsWith("audio/")) return <div className={frame}><audio src={url} controls className="w-full px-3" /></div>;
  return <iframe title={file.originalName} src={url} className="h-[calc(100vh-22rem)] min-h-72 w-full rounded-xl border border-[hsl(var(--border))] bg-white" />;
}

// Right-hand preview of the single selected item (wide screens only).
export function FilesPreviewPane({ selection, folders, resolveUrl, onOpen, onDownload, onShare, onDetails, onClose }) {
  const one = selection.length === 1 ? selection[0] : null;
  const totalBytes = selection.reduce((sum, i) => sum + (i.type === "file" ? Number(i.data.sizeBytes ?? 0) : 0), 0);
  const { width, handleProps } = usePaneWidth();
  return (
    <div className="sticky top-16 hidden shrink-0 self-start xl:block" style={{ width }}>
      {/* Drag the left edge to resize; the width is remembered. */}
      <div {...handleProps} className="group/handle absolute -left-3 inset-y-0 z-10 flex w-3 cursor-col-resize touch-none select-none items-stretch justify-center outline-none">
        <span className="my-2 w-px rounded-full bg-[hsl(var(--border))] transition-colors group-hover/handle:w-0.5 group-hover/handle:bg-[var(--brand-primary)] group-focus-visible/handle:w-0.5 group-focus-visible/handle:bg-[var(--brand-primary)]" />
      </div>
    <aside aria-label="Vista previa" className="flex max-h-[calc(100vh-5rem)] flex-col gap-3 overflow-y-auto rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Vista previa</h2>
        <Button type="button" variant="ghost" size="icon" className="h-7 w-7" aria-label="Ocultar vista previa" onClick={onClose}>
          <PanelRightClose className="h-4 w-4" />
        </Button>
      </div>

      {!selection.length && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 px-4 py-12 text-center text-sm text-[hsl(var(--muted-foreground))]">
          <MousePointerClick className="h-8 w-8" aria-hidden="true" />
          Selecciona un archivo o carpeta para ver su vista previa y sus detalles.
        </div>
      )}

      {selection.length > 1 && (
        <div className="space-y-1 rounded-xl bg-[hsl(var(--muted))]/50 p-4 text-sm">
          <p className="font-medium">{selection.length} elementos seleccionados</p>
          {totalBytes > 0 && <p className="text-[hsl(var(--muted-foreground))]">{formatBytes(totalBytes)} en archivos</p>}
        </div>
      )}

      {one?.type === "file" && (
        <>
          <FilePreview file={one.data} resolveUrl={resolveUrl} onOpen={() => onOpen(one)} />
          <p className="break-words text-sm font-semibold">{one.data.originalName}</p>
          <div>
            <Row label="Tipo" value={getKindLabel(getFileKind(one.data))} />
            <Row label="Tamaño" value={formatBytes(one.data.sizeBytes)} />
            <Row label="Modificado" value={formatDate(one.data.updatedAt ?? one.data.createdAt)} />
            <Row label="Subido" value={formatDate(one.data.createdAt)} />
            {one.data.enabled === false && <Row label="Estado" value="Deshabilitado" />}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={() => onOpen(one)}>Abrir</Button>
            <Button size="sm" variant="outline" onClick={() => onDownload(one.data)}><Download className="h-4 w-4" />Descargar</Button>
            <Button size="sm" variant="outline" onClick={() => onShare(one.data)}><Share2 className="h-4 w-4" />Compartir</Button>
            <Button size="sm" variant="ghost" onClick={() => onDetails(one.data)}><Info className="h-4 w-4" />Detalles</Button>
          </div>
        </>
      )}

      {one?.type === "folder" && (
        <>
          <div className="flex min-h-40 items-center justify-center rounded-xl bg-[hsl(var(--muted))]/50">
            <Folder className="h-20 w-20 text-primary" strokeWidth={1.2} />
          </div>
          <p className="break-words text-sm font-semibold">{one.data.name}</p>
          <div>
            <Row label="Ubicación" value={["Mis carpetas", ...folderPath(folders, one.data.id).slice(0, -1).map((f) => f.name)].join(" / ")} />
            <Row label="Contiene" value={`${one.data.fileCount ?? 0} archivos, ${childrenOf(folders, one.data.id).length} subcarpetas`} />
            <Row label="Quién la ve" value={one.data.scope === "COMPANY" ? "Toda la empresa" : one.data.memberCount ? `Privada, con ${one.data.memberCount} personas` : "Privada"} />
            <Row label="Modificada" value={one.data.updatedAt ? formatDate(one.data.updatedAt) : ""} />
          </div>
          <Button size="sm" onClick={() => onOpen(one)}>Abrir carpeta</Button>
        </>
      )}
    </aside>
    </div>
  );
}
