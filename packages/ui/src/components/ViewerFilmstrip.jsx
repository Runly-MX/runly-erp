import { useEffect, useRef } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { getFileKind } from "../lib/file-kind";
import { FileVisual } from "./FileVisual";

// Floating glass filmstrip for AdvancedFileViewer (multi-file). Overlays the
// content area (iOS Photos style) instead of a docked bar cramped against
// the bottom toolbar; collapses to a "n / total" pill. `hidden` fades it out
// during pinch/pan or when the touch chrome is hidden.
export function ViewerFilmstrip({
  files,
  activeIndex,
  onIndexChange,
  mediaThumbUrls,
  open,
  onOpenChange,
  raised,
  hidden,
}) {
  const thumbRefs = useRef(new Map());

  // Keep the active thumbnail visible when paging via arrows/keyboard, not
  // just when clicking a thumbnail directly.
  useEffect(() => {
    if (!open) return;
    thumbRefs.current.get(activeIndex)?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "center" });
  }, [activeIndex, open]);

  // PDFViewer renders its own bottom toolbar inside the same content box,
  // so `raised` lifts the strip above it.
  const position = ["absolute left-1/2 -translate-x-1/2 z-20", raised ? "bottom-15" : "bottom-3"].join(" ");

  if (!open) {
    return (
      <button
        onClick={() => onOpenChange(true)}
        aria-label="Mostrar miniaturas"
        title="Mostrar miniaturas"
        className={[
          position,
          "h-8 px-3 glass rounded-full flex items-center gap-1.5",
          "text-[11px] text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
          "transition-all duration-200",
          hidden ? "opacity-0 pointer-events-none" : "opacity-100",
        ].join(" ")}
      >
        <ChevronUp className="h-3.5 w-3.5" />
        {activeIndex + 1} / {files.length}
      </button>
    );
  }

  return (
    <div
      className={[
        position,
        "max-w-[calc(100%-1.5rem)] glass rounded-2xl p-1.5",
        "flex items-center gap-1.5",
        "transition-all duration-200",
        hidden ? "opacity-0 translate-y-2 pointer-events-none" : "opacity-100",
      ].join(" ")}
    >
      <div className="flex items-center gap-2 overflow-x-auto px-0.5 py-0.5">
        {files.map((f, i) => {
          const fKind = getFileKind(f);
          const mediaThumbUrl = mediaThumbUrls[f.id] ?? null;
          return (
            <button
              key={f.id ?? i}
              ref={(node) => {
                if (node) thumbRefs.current.set(i, node);
                else thumbRefs.current.delete(i);
              }}
              onClick={() => onIndexChange(i)}
              aria-label={`Ir a ${f.originalName ?? f.name ?? `archivo ${i + 1}`}`}
              aria-current={i === activeIndex}
              className={[
                "h-12 w-12 shrink-0 rounded-lg overflow-hidden transition-all duration-150",
                i === activeIndex ? "ring-2 ring-(--brand-primary) opacity-100" : "opacity-50 hover:opacity-90",
              ].join(" ")}
            >
              {fKind === "video" && mediaThumbUrl ? (
                // #t=0.1 forces the browser to seek and paint that frame as a
                // thumbnail — same trick as MessageAttachments.jsx's VideoCard.
                <video
                  src={`${mediaThumbUrl}#t=0.1`}
                  className="h-12 w-12 object-cover pointer-events-none"
                  muted
                  playsInline
                  preload="metadata"
                />
              ) : (
                <FileVisual
                  file={f}
                  previewUrl={fKind === "image" ? (f.thumbnailUrl ?? mediaThumbUrl) : null}
                  className="h-12 w-12 object-cover"
                />
              )}
            </button>
          );
        })}
      </div>
      <button
        onClick={() => onOpenChange(false)}
        aria-label="Ocultar miniaturas"
        title="Ocultar miniaturas"
        className="h-8 w-8 shrink-0 rounded-lg flex items-center justify-center text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]/50 transition-colors"
      >
        <ChevronDown className="h-4 w-4" />
      </button>
    </div>
  );
}
