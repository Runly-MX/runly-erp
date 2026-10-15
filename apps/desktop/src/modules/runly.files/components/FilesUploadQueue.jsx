import { CheckCircle2, File as FileIcon, Loader2, Upload, X, XCircle } from "lucide-react";

const isBusy = (item) => item.status === "pending" || item.status === "uploading";

// Full-screen drop overlay + floating upload progress card of the explorer.
export function FilesUploadQueue({ isDragOver, queue, onClear, dropTarget }) {
  const busy = queue.some(isBusy);
  return (
    <>
      {isDragOver && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="absolute inset-4 rounded-3xl bg-[var(--brand-primary)]/8 border-2 border-dashed border-[var(--brand-primary)]/50 backdrop-blur-sm" />
          <div className="relative flex flex-col items-center gap-4 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-3xl border border-[var(--brand-primary)]/30 bg-[var(--brand-primary)]/15">
              <Upload className="h-12 w-12 text-[var(--brand-primary)]" />
            </div>
            <div className="space-y-1">
              <p className="text-2xl font-bold text-[hsl(var(--foreground))]">Suelta los archivos aqui</p>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Se subirán a {dropTarget} · Máx. 10 MB por archivo</p>
            </div>
          </div>
        </div>
      )}

      {queue.length > 0 && (
        <div className="fixed bottom-6 right-6 z-40 w-80 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]/95 backdrop-blur-sm shadow-2xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[hsl(var(--border))]">
            {busy ? (
              <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--muted-foreground))] shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
            )}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium leading-none">{busy ? "Subiendo archivos" : "Carga completada"}</p>
              <p className="text-[11px] text-[hsl(var(--muted-foreground))] mt-0.5">
                {queue.filter((q) => q.status === "done").length} / {queue.length} archivos
              </p>
            </div>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={onClear}
              className="ml-1 rounded-md p-1 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="max-h-64 overflow-y-auto divide-y divide-[hsl(var(--border))]">
            {queue.map((item) => (
              <div key={item.id} className="flex items-start gap-3 px-4 py-2.5">
                <FileIcon className="h-4 w-4 text-[hsl(var(--muted-foreground))] shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs truncate text-[hsl(var(--foreground))]">{item.name}</p>
                  {item.status === "uploading" && (
                    <div className="mt-1 h-1 rounded-full bg-[hsl(var(--muted))]">
                      <div className="h-1 w-1/2 rounded-full bg-[var(--brand-primary)] animate-pulse" />
                    </div>
                  )}
                  <p className="text-[10px] text-[hsl(var(--muted-foreground))] mt-0.5">
                    {item.status === "pending" && "En cola..."}
                    {item.status === "uploading" && "Subiendo..."}
                    {item.status === "done" && "Listo"}
                    {item.status === "error" && "Error al subir"}
                  </p>
                </div>
                <div className="shrink-0 mt-0.5">
                  {isBusy(item) && <Loader2 className="h-4 w-4 animate-spin text-[hsl(var(--muted-foreground))]" />}
                  {item.status === "done" && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                  {item.status === "error" && <XCircle className="h-4 w-4 text-[hsl(var(--destructive))]" />}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
