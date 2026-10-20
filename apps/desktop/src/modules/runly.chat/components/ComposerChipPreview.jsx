import { Popover, PopoverAnchor, PopoverContent } from "@runly/ui";
import { EntityPreviewContent } from "./EntityPreviewContent";
import { ChatThemeScope } from "./ChatThemeScope";

// Preview of a chip while it is still in the composer (hover on desktop,
// tap on touch), anchored to the chip's rectangle inside the text field.
// Record links show the same live card as in a sent message; a person
// mention shows who it is.
export function ComposerChipPreview({ target, members = [], onClose, onEnter, onLeave }) {
  if (!target) return null;
  const { rect } = target;
  const person = target.kind === "user" ? members.find((m) => m.id === target.id) : null;
  return (
    <Popover open onOpenChange={(open) => { if (!open) onClose(); }}>
      <PopoverAnchor asChild>
        <span
          aria-hidden="true"
          style={{ position: "fixed", left: rect.left, top: rect.top, width: rect.width, height: rect.height, pointerEvents: "none" }}
        />
      </PopoverAnchor>
      <PopoverContent
        side="top"
        align="start"
        className="w-80 p-3"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
      >
        <ChatThemeScope>
        {target.kind === "entity" ? (
          <EntityPreviewContent entityType={target.entityType} recordId={target.id} onNavigate={onClose} />
        ) : (
          <div className="space-y-0.5">
            <p className="text-sm font-semibold">{person?.displayName ?? target.name}</p>
            {person?.description ? <p className="text-xs text-[hsl(var(--muted-foreground))]">{person.description}</p> : null}
          </div>
        )}
        </ChatThemeScope>
      </PopoverContent>
    </Popover>
  );
}
