import { Button } from "@runly/ui";
import { Archive, Download, FolderSymlink, X } from "lucide-react";

// Floating bar shown while rows are selected (thumb-reachable on phones).
export function FilesSelectionBar({ count, loading, onClear, onDownload, onZip, onMove }) {
  if (!count) return null;
  return (
    <div
      role="toolbar"
      aria-label="Acciones de selección"
      className="fixed inset-x-3 z-40 mx-auto flex max-w-xl items-center gap-1.5 rounded-2xl border border-[hsl(var(--border))] glass-strong p-2 shadow-xl"
      style={{ bottom: "calc(0.75rem + env(safe-area-inset-bottom, 0px))" }}
    >
      <Button variant="ghost" size="icon" aria-label="Limpiar selección" onClick={onClear} disabled={loading}>
        <X className="h-4 w-4" />
      </Button>
      <span className="min-w-0 flex-1 truncate text-sm font-medium tabular-nums">
        {count} {count === 1 ? "seleccionado" : "seleccionados"}
      </span>
      {onMove && (
        <Button variant="outline" size="sm" aria-label="Mover a carpeta" onClick={onMove} disabled={loading}>
          <FolderSymlink className="h-4 w-4" />
          <span className="max-sm:sr-only">Mover</span>
        </Button>
      )}
      <Button variant="outline" size="sm" aria-label="Descargar seleccionados" onClick={onDownload} disabled={loading}>
        <Download className="h-4 w-4" />
        <span className="max-sm:sr-only">Descargar</span>
      </Button>
      <Button size="sm" aria-label="Descargar ZIP" onClick={onZip} disabled={loading}>
        <Archive className="h-4 w-4" />
        ZIP
      </Button>
    </div>
  );
}
