import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@runly/ui";
import { ParticipantTile } from "../ParticipantTile";
import { bestFitGrid, pageCount, pageSlice } from "../lib/gridFit";
import { useElementSize } from "./useElementSize";

const GAP = 10;

// Meet-style tiled view: every tile the same size, as large as the stage
// allows, centered; pages of 16 with arrows when the call is bigger.
// `fill`: tiles take the whole cell instead of keeping the aspect ratio
// (phones, where letterboxing tiles wastes most of a tall screen).
export function BestFitGrid({ entries, tileProps, aspect = 16 / 9, gap = GAP, fill = false, className = "" }) {
  const [ref, size] = useElementSize();
  const [page, setPage] = useState(0);
  const pages = pageCount(entries.length);
  useEffect(() => {
    if (page > pages - 1) setPage(pages - 1);
  }, [page, pages]);

  const visible = pageSlice(entries, page);
  const reserve = pages > 1 ? 36 : 0;
  const usableHeight = Math.max(0, size.height - reserve);
  const best = bestFitGrid({ count: visible.length, width: size.width, height: usableHeight, aspect, gap });
  const fit = fill && best.tileWidth > 0
    ? {
        ...best,
        tileWidth: Math.floor((size.width - gap * (best.cols - 1)) / best.cols),
        tileHeight: Math.floor((usableHeight - gap * (best.rows - 1)) / best.rows),
      }
    : best;
  const avatarSize = fit.tileHeight > 260 ? "xl" : fit.tileHeight > 170 ? "lg" : fit.tileHeight > 110 ? "md" : "sm";

  return (
    <div ref={ref} className={cn("relative flex h-full w-full flex-col items-center justify-center", className)}>
      {fit.tileWidth > 0 && (
        // Flex-wrap (not CSS grid) so an incomplete last row is centered.
        <div
          className="flex flex-wrap content-center justify-center"
          style={{ width: `${fit.cols * fit.tileWidth + (fit.cols - 1) * gap}px`, gap: `${gap}px` }}
        >
          {visible.map((entry) => (
            <div
              key={`${entry.participant?.sid || entry.participant?.identity || "local"}:${entry.source ?? "cam"}`}
              style={{ width: `${fit.tileWidth}px`, height: `${fit.tileHeight}px` }}
            >
              <ParticipantTile
                participant={entry.participant}
                isLocal={entry.isLocal}
                preferSource={entry.source === "screen" ? "screen" : "camera"}
                avatarSize={avatarSize}
                compact={fit.tileHeight < 140 || fit.tileWidth < 190}
                {...tileProps(entry)}
              />
            </div>
          ))}
        </div>
      )}
      {pages > 1 && (
        <div className="mt-2 flex h-7 items-center gap-2 rounded-full bg-black/40 px-1.5 text-xs text-white/80 backdrop-blur">
          <button type="button" aria-label="Página anterior" disabled={page === 0} onClick={() => setPage((p) => p - 1)} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-30">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="tabular-nums">{page + 1} / {pages}</span>
          <button type="button" aria-label="Página siguiente" disabled={page >= pages - 1} onClick={() => setPage((p) => p + 1)} className="flex h-6 w-6 items-center justify-center rounded-full hover:bg-white/10 disabled:opacity-30">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>
      )}
    </div>
  );
}

