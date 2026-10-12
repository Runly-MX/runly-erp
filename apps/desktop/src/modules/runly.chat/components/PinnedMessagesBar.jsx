// apps/desktop/src/modules/runly.chat/components/PinnedMessagesBar.jsx
import { useState, useEffect } from "react";
import { Pin, List, X } from "lucide-react";
import { renderMentionText } from "@runly/ui";

// Slim strip anchored above the message list showing the conversation's
// pinned messages (WhatsApp / Telegram style). Tapping the strip jumps to the
// current pinned message and, when there's more than one, advances to the
// next. The list button opens the full PinnedMessagesSheet. Renders nothing
// when nothing is pinned, so it's safe to mount unconditionally.
export function PinnedMessagesBar({
  pinnedMessages = [],
  onJump,
  onOpenList,
  onUnpin,
  canUnpin = false,
}) {
  const count = pinnedMessages.length;
  const [idx, setIdx] = useState(0);

  useEffect(() => { if (idx >= count && count > 0) setIdx(0); }, [count, idx]);

  if (!count) return null;

  const current = pinnedMessages[Math.min(idx, count - 1)];
  const preview = current?.body
    ? renderMentionText(current.body)
    : "Archivo adjunto";

  function handleBarClick() {
    onJump?.(current.id, current.thread_root_id);
    if (count > 1) setIdx((i) => (i + 1) % count);
  }

  return (
    <div className="shrink-0 flex items-stretch gap-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-2)/0.8)] px-2.5 py-1.5">
      <span className="w-0.5 rounded-full bg-[var(--brand-primary)] shrink-0" />
      <button
        type="button"
        onClick={handleBarClick}
        className="flex-1 min-w-0 flex items-center gap-2 text-left"
        title="Ir al mensaje fijado"
      >
        <Pin className="h-3.5 w-3.5 shrink-0 text-[var(--brand-primary)]" />
        <span className="min-w-0 flex flex-col">
          <span className="text-[11px] font-semibold text-[var(--brand-primary)] leading-tight">
            {count > 1 ? `Mensajes fijados ${idx + 1}/${count}` : "Mensaje fijado"}
          </span>
          <span className="text-xs text-[hsl(var(--muted-foreground))] truncate leading-tight">
            {preview}
          </span>
        </span>
      </button>
      {canUnpin && (
        <button
          type="button"
          onClick={() => onUnpin?.(current.id)}
          title="Desfijar mensaje"
          className="shrink-0 h-6 w-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-red-500 hover:bg-[hsl(var(--muted))] transition-colors"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
      {count > 1 && onOpenList && (
        <button
          type="button"
          onClick={onOpenList}
          title="Ver todos los mensajes fijados"
          className="shrink-0 h-6 w-6 flex items-center justify-center rounded text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))] transition-colors"
        >
          <List className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
