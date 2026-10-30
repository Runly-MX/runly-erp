import { FolderOpen, MessageSquare, Video } from "lucide-react";

// Second tier of the floating chat header while a view replaces the message
// list (Archivos, Grabaciones): same glass band, attached right under the
// header, with tabs to switch between the conversation's messages, files and
// recordings — instead of a loose "back" row sitting on the content.
const TABS = [
  { value: "messages", label: "Mensajes", icon: MessageSquare },
  { value: "files", label: "Archivos", icon: FolderOpen },
  { value: "recordings", label: "Grabaciones", icon: Video },
];

export function ChatSubviewBar({ value, onChange, counts = {}, showRecordings = true }) {
  const tabs = showRecordings ? TABS : TABS.filter((t) => t.value !== "recordings");
  return (
    <div className="chat-glass chat-float-bar chat-float-bar-edge relative z-10 flex h-12 shrink-0 items-center px-2 sm:px-3">
      <div role="tablist" aria-label="Contenido de la conversación" className="flex w-full min-w-0 items-center gap-1">
        {tabs.map(({ value: tab, label, icon: Icon }) => {
          const active = tab === value;
          const count = counts[tab];
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(tab)}
              className={[
                "inline-flex h-9 min-w-0 flex-1 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors sm:flex-none",
                "touch-manipulation focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-primary)]/40",
                active
                  ? "bg-[var(--brand-primary)]/14 text-[var(--brand-primary)]"
                  : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]/60 hover:text-[hsl(var(--foreground))]",
              ].join(" ")}
            >
              <Icon className="hidden h-4 w-4 shrink-0 sm:block" aria-hidden />
              <span className="truncate">{label}</span>
              {Number.isFinite(count) && count > 0 && (
                <span className="tabular-nums text-xs opacity-70">{count}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
