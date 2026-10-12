import { useEffect, useState } from "react";
import { cn, Sheet, SheetContent, SheetTitle, SheetDescription } from "@runly/ui";
import { MessageSquare, Users, X } from "lucide-react";
import "../ui/call-ui.css";

const TABS = [
  { value: "chat", label: "Mensajes", Icon: MessageSquare },
  { value: "people", label: "Personas", Icon: Users },
];

function PanelTabs({ tab, onTab, counts, onClose }) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-white/10 p-2.5">
      <div role="tablist" aria-label="Panel de la llamada" className="grid flex-1 grid-cols-2 gap-1 rounded-xl bg-white/[0.05] p-1">
        {TABS.map(({ value, label, Icon }) => {
          const active = tab === value;
          const count = counts?.[value];
          return (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onTab(value)}
              className={cn(
                "flex h-9 items-center justify-center gap-1.5 rounded-lg text-sm font-semibold transition-colors",
                active ? "bg-white/[0.12] text-white shadow-sm" : "text-white/55 hover:text-white",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden />
              {label}
              {count ? (
                <span className={cn("rounded-full px-1.5 text-[10px] font-bold", value === "people" && counts.lobby ? "bg-(--call-hand) text-amber-950" : "bg-(--call-accent) text-(--brand-primary-foreground)")}>
                  {count > 99 ? "99+" : count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <button type="button" onClick={onClose} aria-label="Cerrar panel" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white/60 hover:bg-white/10 hover:text-white">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

const EXIT_MS = 200;

// Desktop: a column beside the stage with Mensajes | Personas tabs. Slides
// in from the right; on close it slides out before unmounting. Switching tabs
// fades the new content in (display none -> block restarts the animation).
export function CallSidePanel({ open, tab, onTab, onClose, counts, chat, people }) {
  const [mounted, setMounted] = useState(open);
  const [leaving, setLeaving] = useState(false);
  useEffect(() => {
    if (open) { setMounted(true); setLeaving(false); return undefined; }
    if (!mounted) return undefined;
    setLeaving(true);
    const t = setTimeout(() => { setMounted(false); setLeaving(false); }, EXIT_MS);
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!mounted) return null;

  return (
    <aside
      className={cn(
        "call-glass m-3 ml-0 flex w-[380px] shrink-0 flex-col overflow-hidden rounded-2xl",
        leaving ? "call-panel-out" : "call-panel-in",
      )}
      aria-label="Panel de la llamada"
    >
      <PanelTabs tab={tab} onTab={onTab} counts={counts} onClose={onClose} />
      <div className="min-h-0 flex-1">
        {/* Both stay mounted so the chat keeps its scroll/draft when switching tabs. */}
        <div className={cn("dark h-full call-fade-up", tab === "chat" ? "block" : "hidden")}>{chat}</div>
        <div className={cn("dark h-full call-fade-up", tab === "people" ? "block" : "hidden")}>{people}</div>
      </div>
    </aside>
  );
}

// Phones/tablets: the same panel as a tall bottom sheet over the stage.
export function CallPanelSheet({ open, tab, onTab, onClose, counts, chat, people }) {
  return (
    <Sheet open={open} onOpenChange={(next) => { if (!next) onClose(); }}>
      <SheetContent
        side="bottom"
        className="call-dialog h-[88dvh] max-h-[88dvh] gap-0 overflow-hidden p-0 sm:max-w-xl"
        style={{ zIndex: 10002 }}
      >
        <SheetTitle className="sr-only">{tab === "chat" ? "Mensajes" : "Personas"}</SheetTitle>
        <SheetDescription className="sr-only">Panel de la llamada</SheetDescription>
        <PanelTabs tab={tab} onTab={onTab} counts={counts} onClose={onClose} />
        <div key={tab} className="dark min-h-0 flex-1 call-fade-up">
          {tab === "chat" ? chat : people}
        </div>
      </SheetContent>
    </Sheet>
  );
}
