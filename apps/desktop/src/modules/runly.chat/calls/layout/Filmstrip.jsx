import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@runly/ui";
import { ParticipantTile } from "../ParticipantTile";

// A strip of small tiles beside the stage: horizontal (below on desktop /
// portrait phones, scroll-snapping like a carousel) or vertical (right side
// on landscape phones). Optional collapse toggle for desktop.
export function Filmstrip({ entries, tileProps, orientation = "horizontal", size = "md", collapsed = false, onToggleCollapsed = null, className = "" }) {
  if (!entries.length) return null;
  const horizontal = orientation === "horizontal";
  const tileClass = horizontal
    ? size === "sm" ? "h-[84px] w-[112px]" : "h-[112px] w-[176px]"
    : "h-[96px] w-[150px]";

  return (
    <div className={cn("relative shrink-0", className)}>
      {onToggleCollapsed && (
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="absolute -top-3 left-1/2 z-10 flex h-6 -translate-x-1/2 items-center gap-1 rounded-full bg-black/60 px-2.5 text-[11px] font-medium text-white/80 ring-1 ring-white/10 backdrop-blur hover:text-white"
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {collapsed ? `Mostrar ${entries.length}` : "Ocultar"}
        </button>
      )}
      {!collapsed && (
        <div
          className={cn(
            "flex gap-2",
            horizontal ? "call-scroll-x mx-auto w-fit max-w-full overflow-x-auto px-0.5 pb-0.5 pt-1" : "call-scroll-y h-full flex-col overflow-y-auto",
          )}
        >
          {entries.map((entry) => (
            <div key={`${entry.participant?.sid || entry.participant?.identity}:${entry.source ?? "cam"}`} className={cn("shrink-0", tileClass)}>
              <ParticipantTile
                participant={entry.participant}
                isLocal={entry.isLocal}
                preferSource={entry.source === "screen" ? "screen" : "camera"}
                avatarSize="sm"
                compact
                {...tileProps(entry)}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
