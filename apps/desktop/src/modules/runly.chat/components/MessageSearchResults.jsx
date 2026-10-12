import { useMemo } from "react";
import { Paperclip } from "lucide-react";
import { EmptyState, Skeleton, ErrorState } from "@runly/ui";
import { AvatarCircle } from "./AvatarCircle";
import { buildSnippetSegments } from "../lib/searchSnippet";

function relativeDate(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return "hoy";
  if (days === 1) return "ayer";
  if (days < 7) return `hace ${days} d`;
  return d.toLocaleDateString("es", { day: "numeric", month: "short" });
}

function HighlightedSpan({ text, matchRanges, radius, className }) {
  const { segments, truncatedStart, truncatedEnd } = useMemo(
    () => buildSnippetSegments(text, matchRanges, radius),
    [text, matchRanges, radius],
  );
  return (
    <span className={className}>
      {truncatedStart ? "…" : ""}
      {segments.map((s, i) =>
        s.mark ? (
          <mark
            key={i}
            className="rounded px-0.5 bg-[var(--brand-primary)]/25 text-[hsl(var(--foreground))]"
          >
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
      {truncatedEnd ? "…" : ""}
    </span>
  );
}

function Snippet({ body, matchRanges }) {
  return (
    <HighlightedSpan
      text={body}
      matchRanges={matchRanges}
      radius={80}
      className="text-xs text-[hsl(var(--muted-foreground))] line-clamp-2"
    />
  );
}

// WhatsApp-style "Mensajes" block under the conversation list. `hits` come from
// useChatMessageSearch (global mode), grouped here by conversation.
export function MessageSearchResults({ hits, isSearching, isError, truncated, onOpen }) {
  const groups = useMemo(() => {
    const byConv = new Map();
    for (const h of hits) {
      if (!byConv.has(h.conversationId)) {
        byConv.set(h.conversationId, { conversation: h.conversation, items: [] });
      }
      byConv.get(h.conversationId).items.push(h);
    }
    return [...byConv.values()];
  }, [hits]);

  return (
    <div className="pt-2">
      <p className="px-2 py-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">
        Mensajes
      </p>

      {isError && (
        <ErrorState className="py-6" title="No se pudo buscar" description="Intenta de nuevo." />
      )}

      {!isError && isSearching && !hits.length && (
        <div className="space-y-2 p-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="flex items-center gap-3 px-2">
              <Skeleton className="h-9 w-9 rounded-full shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-2.5 w-44" />
              </div>
            </div>
          ))}
        </div>
      )}

      {!isError && !isSearching && !hits.length && (
        <EmptyState
          className="py-6"
          title="Sin mensajes"
          description="No se encontraron coincidencias."
        />
      )}

      {!isError &&
        groups.map(({ conversation, items }) => (
          <div key={conversation.id} className="mb-1">
            <div className="flex items-center gap-2 px-2 py-1">
              <AvatarCircle
                size="sm"
                name={conversation.title ?? "Chat"}
                type={conversation.type}
                avatarUrl={conversation.avatarUrl}
                avatarEmoji={conversation.avatarEmoji}
              />
              <span className="text-xs font-medium truncate">
                {conversation.title ?? "Chat"}
              </span>
            </div>
            {items.map((h) => (
              <button
                key={h.messageId}
                type="button"
                onClick={() => onOpen(h)}
                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-[hsl(var(--muted))] transition-colors"
              >
                <div className="flex items-baseline justify-between gap-2">
                  <HighlightedSpan
                    text={h.sender.displayName ?? "Usuario"}
                    matchRanges={h.sender.matchRanges}
                    radius={40}
                    className="text-xs font-medium truncate"
                  />
                  <span className="text-[10px] text-[hsl(var(--muted-foreground))] shrink-0">
                    {relativeDate(h.createdAt)}
                  </span>
                </div>
                <Snippet body={h.body} matchRanges={h.matchRanges} />
                {/* Body/sender showed no highlight but the row still matched —
                    it was the attachment's file name; show it so the result
                    doesn't look unexplained (the original "Pu" bug report). */}
                {h.attachmentMatch && h.attachmentMatch.matchRanges.length > 0 && (
                  <div className="mt-0.5 flex items-center gap-1 text-[hsl(var(--muted-foreground))]">
                    <Paperclip className="h-3 w-3 shrink-0" />
                    <HighlightedSpan
                      text={h.attachmentMatch.fileName}
                      matchRanges={h.attachmentMatch.matchRanges}
                      radius={40}
                      className="text-xs truncate"
                    />
                  </div>
                )}
              </button>
            ))}
          </div>
        ))}

      {truncated && (
        <p className="px-2 py-1.5 text-[10px] text-[hsl(var(--muted-foreground))]">
          Muchos resultados. Refina tu busqueda.
        </p>
      )}
    </div>
  );
}
