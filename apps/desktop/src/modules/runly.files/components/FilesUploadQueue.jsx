import { formatBytes } from "@runly/ui";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  File as FileIcon,
  FileArchive,
  FileSpreadsheet,
  FileText,
  Film,
  Image as ImageIcon,
  Loader2,
  Music,
  Presentation,
  RotateCw,
  Upload,
  X,
  XCircle,
} from "lucide-react";

const isBusy = (item) => item.status === "pending" || item.status === "uploading";

// Icon + tint per kind of file, from the MIME type or, failing that, the extension.
function kindOf(item) {
  const mime = String(item.mime ?? "");
  const ext = String(item.name ?? "").split(".").pop().toLowerCase();
  if (mime.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "heic", "avif", "svg"].includes(ext)) return { Icon: ImageIcon, tint: "text-violet-600 bg-violet-500/10" };
  if (mime.startsWith("video/") || ["mp4", "mov", "webm"].includes(ext)) return { Icon: Film, tint: "text-pink-600 bg-pink-500/10" };
  if (mime.startsWith("audio/") || ["mp3", "wav", "m4a"].includes(ext)) return { Icon: Music, tint: "text-pink-600 bg-pink-500/10" };
  if (["xls", "xlsx", "csv", "ods"].includes(ext)) return { Icon: FileSpreadsheet, tint: "text-emerald-600 bg-emerald-500/10" };
  if (["ppt", "pptx", "odp"].includes(ext)) return { Icon: Presentation, tint: "text-orange-600 bg-orange-500/10" };
  if (["zip", "rar", "7z"].includes(ext)) return { Icon: FileArchive, tint: "text-amber-600 bg-amber-500/10" };
  if (mime === "application/pdf" || ext === "pdf") return { Icon: FileText, tint: "text-red-600 bg-red-500/10" };
  if (["doc", "docx", "odt", "txt", "md", "rtf"].includes(ext) || mime.startsWith("text/")) return { Icon: FileText, tint: "text-blue-600 bg-blue-500/10" };
  return { Icon: FileIcon, tint: "text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))]" };
}

const STATUS_LABEL = {
  pending: "En cola",
  done: "Listo",
  canceled: "Cancelada",
};

const iconButton =
  "rounded-md p-1 text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]";

// Full-screen drop overlay + floating upload card of the explorer. The card can be
// collapsed to its header, closed (a chip brings it back) and every entry can be
// cancelled, retried or removed. The list survives reloads (see useFilesUpload).
export function FilesUploadQueue({ isDragOver, queue, dropTarget, open, onOpenChange, collapsed, onCollapsedChange, onRemove, onRetry, onClearFinished, onCancelAll, canRetry }) {
  const busy = queue.some(isBusy);
  const done = queue.filter((q) => q.status === "done").length;
  const failed = queue.filter((q) => q.status === "error").length;
  const title = busy ? "Subiendo archivos" : failed ? "Carga con errores" : "Carga completada";
  const finished = queue.length > 0 && !busy;
  const total = queue.filter((q) => q.status !== "canceled").length;

  return (
    <>
      {isDragOver && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-4 rounded-3xl border-2 border-dashed border-[var(--brand-primary)]/50 bg-[var(--brand-primary)]/8 backdrop-blur-sm" />
          <div className="relative flex flex-col items-center gap-4 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/15">
              <Upload className="h-12 w-12 text-[var(--brand-primary)]" />
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-[hsl(var(--foreground))]">Suelta los archivos aquí</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                Se subirán a {dropTarget} · o suéltalos sobre una carpeta · Máx. 10 MB por archivo
              </p>
            </div>
          </div>
        </div>
      )}

      {queue.length > 0 && !open && (
        <button
          type="button"
          onClick={() => onOpenChange(true)}
          aria-label="Mostrar cargas"
          className="fixed bottom-20 right-3 z-40 flex items-center gap-2 rounded-full border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3.5 py-2 text-sm font-medium shadow-lg sm:bottom-6 sm:right-6"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : failed ? <XCircle className="h-4 w-4 text-[hsl(var(--destructive))]" /> : <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          Cargas · {done}/{total}
        </button>
      )}

      {queue.length > 0 && open && (
        <div
          role="region"
          aria-label="Cargas de archivos"
          className="fixed bottom-20 left-3 right-3 z-40 overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 shadow-2xl backdrop-blur-sm sm:bottom-6 sm:left-auto sm:right-6 sm:w-96"
        >
          <div className="flex items-center gap-2 px-4 py-3">
            {busy ? (
              <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[hsl(var(--muted-foreground))]" />
            ) : failed ? (
              <XCircle className="h-4 w-4 shrink-0 text-[hsl(var(--destructive))]" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium leading-none">{title}</p>
              <p className="mt-0.5 text-[11px] text-[hsl(var(--muted-foreground))]">
                {done} / {total} archivos{failed ? ` · ${failed} con error` : ""}
              </p>
            </div>
            <button type="button" aria-label={collapsed ? "Expandir" : "Minimizar"} onClick={() => onCollapsedChange(!collapsed)} className={iconButton}>
              {collapsed ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>
            <button type="button" aria-label="Cerrar" title="Cerrar (las cargas siguen en segundo plano)" onClick={() => onOpenChange(false)} className={iconButton}>
              <X className="h-4 w-4" />
            </button>
          </div>

          {!collapsed && (
            <>
              <div className="max-h-72 divide-y divide-[hsl(var(--border))] overflow-y-auto border-t border-[hsl(var(--border))]">
                {queue.map((item) => {
                  const { Icon, tint } = kindOf(item);
                  const percent = item.progress == null ? null : Math.round(item.progress * 100);
                  return (
                    <div key={item.id} className="flex items-center gap-3 px-4 py-2.5">
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tint}`}>
                        <Icon className="h-4.5 w-4.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs text-[hsl(var(--foreground))]" title={item.name}>{item.name}</p>
                        {item.status === "uploading" && (
                          <div className="mt-1 h-1 rounded-full bg-[hsl(var(--muted))]">
                            <div
                              className={`h-1 rounded-full bg-[var(--brand-primary)] transition-[width] ${percent == null ? "w-1/2 animate-pulse" : ""}`}
                              style={percent == null ? undefined : { width: `${percent}%` }}
                            />
                          </div>
                        )}
                        <p className={`mt-0.5 truncate text-[10px] ${item.status === "error" ? "text-[hsl(var(--destructive))]" : "text-[hsl(var(--muted-foreground))]"}`} title={item.error}>
                          {item.size != null && `${formatBytes(item.size)} · `}
                          {item.status === "uploading" ? `Subiendo${percent == null ? "..." : ` ${percent}%`}` : item.status === "error" ? item.error || "Error al subir" : STATUS_LABEL[item.status]}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center">
                        {(item.status === "error" || item.status === "canceled") && canRetry(item.id) && (
                          <button type="button" aria-label={`Reintentar ${item.name}`} onClick={() => onRetry(item.id)} className={iconButton}>
                            <RotateCw className="h-4 w-4" />
                          </button>
                        )}
                        {item.status === "done" && <CheckCircle2 className="mx-1 h-4 w-4 text-emerald-600" />}
                        <button
                          type="button"
                          aria-label={isBusy(item) ? `Cancelar ${item.name}` : `Quitar ${item.name}`}
                          title={isBusy(item) ? "Cancelar" : "Quitar de la lista"}
                          onClick={() => onRemove(item.id)}
                          className={iconButton}
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
              <div className="flex justify-end gap-3 border-t border-[hsl(var(--border))] px-4 py-2 text-xs">
                {busy && (
                  <button type="button" onClick={onCancelAll} className="font-medium text-[hsl(var(--destructive))] hover:underline">
                    Cancelar todo
                  </button>
                )}
                {finished && (
                  <button type="button" onClick={onClearFinished} className="font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:underline">
                    Limpiar lista
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </>
  );
}
