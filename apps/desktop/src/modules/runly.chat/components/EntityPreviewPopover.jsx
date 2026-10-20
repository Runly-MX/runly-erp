import { useRef, useState } from "react";
import { Popover, PopoverAnchor, PopoverContent, useCoarsePointer } from "@runly/ui";
import { EntityPreviewContent } from "./EntityPreviewContent";
import { ChatThemeScope } from "./ChatThemeScope";

// Wraps any connector chip/card: hover opens the preview on desktop, a tap
// opens it on touch (the preview's "Abrir" button then navigates). On desktop
// a plain click still runs the child's own action (navigate).
export function EntityPreviewPopover({ entityType, recordId, snapshot, children }) {
  const coarse = useCoarsePointer();
  const [open, setOpen] = useState(false);
  const timer = useRef(null);
  const schedule = (next, delay) => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setOpen(next), delay);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverAnchor asChild>
        <span
          className="inline-flex max-w-full"
          onMouseEnter={coarse ? undefined : () => schedule(true, 350)}
          onMouseLeave={coarse ? undefined : () => schedule(false, 150)}
          onClickCapture={coarse ? (e) => { e.preventDefault(); e.stopPropagation(); setOpen((v) => !v); } : undefined}
        >
          {children}
        </span>
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="start"
        className="w-80 p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={coarse ? undefined : () => schedule(true, 0)}
        onMouseLeave={coarse ? undefined : () => schedule(false, 150)}
      >
        {open ? (
          <ChatThemeScope>
            <EntityPreviewContent entityType={entityType} recordId={recordId} snapshot={snapshot} onNavigate={() => setOpen(false)} />
          </ChatThemeScope>
        ) : null}
      </PopoverContent>
    </Popover>
  );
}
