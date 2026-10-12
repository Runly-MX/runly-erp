import { cn, Popover, PopoverTrigger, PopoverContent } from "@runly/ui";
import { Hand } from "lucide-react";
import { QUICK_REACTIONS } from "../lib/callEphemeral.js";

// Quick reactions (data-channel only). `children` is the trigger button.
// `onToggleHand` adds a raise-hand toggle (compact bars without a hand button).
export function ReactionPopover({ children, onReact, side = "top", onToggleHand = null, handRaised = false }) {
  return (
    <Popover>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent side={side} align="center" sideOffset={10} className="call-dialog z-60 w-auto rounded-full p-1.5">
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
          {onToggleHand && (
            <>
              <span className="mx-1 h-7 w-px bg-white/15" aria-hidden />
              <button
                type="button"
                onClick={onToggleHand}
                aria-pressed={handRaised}
                aria-label={handRaised ? "Bajar la mano" : "Levantar la mano"}
                className={cn(
                  "flex h-11 w-11 items-center justify-center rounded-full transition-colors",
                  handRaised ? "bg-amber-400 text-amber-950" : "text-white hover:bg-white/10",
                )}
              >
                <Hand className="h-5 w-5" />
              </button>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
