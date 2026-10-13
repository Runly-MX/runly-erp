import { FileImage, Loader2, Play } from "lucide-react";
import { cn } from "@runly/ui";
import { isVideoMime } from "../../lib/chatUtils";
import { useMediaSignedUrl } from "../../hooks/useChatMedia";
import { formatShortDate, groupByMonth, useInView } from "./mediaUtils";

function formatDuration(ms) {
  if (!ms) return null;
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// Square tile; nothing is requested until it scrolls near the viewport.
// Photos use the small "card" variant; videos load only their metadata
// (first frame) from the original.
function MediaTile({ item, conversationName, onOpen }) {
  const [ref, inView] = useInView();
  const video = isVideoMime(item.mimeType);
  const { data: url, isLoading } = useMediaSignedUrl(item.id, video ? "full" : "card", inView);
  const duration = video ? formatDuration(item.durationMs) : null;

  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onOpen(item)}
      title={`${item.fileName} · ${conversationName}`}
      className="group relative aspect-square overflow-hidden rounded-xl bg-[hsl(var(--muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)"
    >
      {url ? (
        video ? (
          <video src={`${url}#t=0.001`} preload="metadata" muted playsInline className="h-full w-full object-cover" />
        ) : (
          <img src={url} alt={item.fileName ?? ""} loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]" />
        )
      ) : (
        <span className="flex h-full w-full items-center justify-center text-[hsl(var(--muted-foreground))]">
          {inView && isLoading ? <Loader2 className="h-5 w-5 animate-spin opacity-60" /> : <FileImage className="h-6 w-6 opacity-60" />}
        </span>
      )}
      {video && (
        <span className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
            <Play className="ml-0.5 h-4 w-4 fill-current" aria-hidden />
          </span>
        </span>
      )}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-between gap-1 bg-linear-to-t from-black/65 to-transparent px-2 pb-1.5 pt-6 text-[10px] font-medium text-white opacity-0 transition-opacity group-hover:opacity-100 max-md:opacity-100">
        <span className="truncate">{conversationName}</span>
        <span className="shrink-0 tabular-nums">{duration ?? formatShortDate(item.createdAt)}</span>
      </span>
    </button>
  );
}

export function MediaGrid({ items, nameOf, onOpen }) {
  return (
    <div className="space-y-5">
      {groupByMonth(items, (i) => i.createdAt).map((group) => (
        <section key={group.key}>
          <h3 className="mb-2 px-0.5 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{group.label}</h3>
          <div className={cn("grid gap-1.5 grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8")}>
            {group.items.map((item) => (
              <MediaTile key={item.id} item={item} conversationName={nameOf(item.conversationId)} onOpen={onOpen} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
