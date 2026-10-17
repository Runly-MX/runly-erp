import { Download, ExternalLink, Share2 } from "lucide-react";
import { formatBytes, getKindLabel } from "../lib/file-kind";
import { FileVisual } from "./FileVisual";

const secondaryBtn =
  "flex-1 h-8 rounded-lg flex items-center justify-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))] bg-[hsl(var(--muted))] hover:bg-[hsl(var(--muted-foreground))]/20 transition-colors duration-150";

// AdvancedFileViewer's card for files without an inline preview: name, kind,
// size, plus download/open/share and (for Office formats) the editor.
export function ViewerGenericPreview({ file, kind, officeOpenable, onOpenOffice, onDownload, onOpen, onShare }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center p-6">
      <div className="w-full max-w-xs glass rounded-2xl p-6">
        <div className="flex items-center gap-4 mb-5">
          <FileVisual file={file} previewUrl={null} className="h-12 w-12 rounded-xl bg-[hsl(var(--muted))] shrink-0" />
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[hsl(var(--foreground))] truncate">{file?.originalName}</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5">{getKindLabel(kind)}</p>
            <p className="text-xs text-[hsl(var(--muted-foreground))]/70">{formatBytes(file?.sizeBytes ?? 0)}</p>
          </div>
        </div>
        <p className="text-xs text-[hsl(var(--muted-foreground))]/70 mb-4 leading-relaxed">
          {officeOpenable
            ? "Este documento se edita en el editor de Office."
            : "No hay vista previa disponible para este tipo de archivo."}
        </p>
        {officeOpenable && (
          <button
            onClick={onOpenOffice}
            className="w-full h-9 mb-2 rounded-lg flex items-center justify-center gap-1.5 text-xs font-medium text-[var(--brand-primary-foreground)] bg-[var(--brand-primary)] hover:opacity-90 transition-opacity"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir en editor de Office
          </button>
        )}
        <div className="flex gap-2">
          <button onClick={onDownload} className={secondaryBtn}>
            <Download className="h-3.5 w-3.5" />
            Descargar
          </button>
          <button onClick={onOpen} className={secondaryBtn}>
            <ExternalLink className="h-3.5 w-3.5" />
            Abrir
          </button>
          {onShare && (
            <button onClick={onShare} className={secondaryBtn}>
              <Share2 className="h-3.5 w-3.5" />
              Compartir
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
