import { Popover, PopoverTrigger, PopoverContent } from "@runly/ui";
import { QUICK_REACTIONS } from "../lib/callEphemeral.js";

// Quick reactions (data-channel only). `children` is the trigger button.
export function ReactionPopover({ children, onReact, side = "top" }) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side={side} align="center" sideOffset={10} className="dark z-60 w-auto rounded-full p-1.5">
        <div className="flex items-center gap-0.5" role="group" aria-label="Reacciones">
          {QUICK_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => onReact?.(emoji)}
              aria-label={`Reaccionar con ${emoji}`}
              className="flex h-11 w-11 items-center justify-center rounded-full text-2xl transition-transform duration-150 hover:scale-110 hover:bg-white/10 active:scale-95"
            >
              {emoji}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
