import { forwardRef } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "../lib/utils.js";

// "Back" arrow for headers and sub-panels. Phones get a 44px touch target
// (the arrow keeps its size; the hit area grows and is pulled into the
// gutter with a negative margin so the header layout does not shift);
// md+ keeps the compact 32px button.
export const BackButton = forwardRef(function BackButton(
  { onClick, label = "Volver", className, iconClassName, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={cn(
        "flex shrink-0 touch-manipulation items-center justify-center rounded-full text-[hsl(var(--muted-foreground))] transition-colors",
        "hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] active:bg-[hsl(var(--muted))]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]/40",
        "-ml-2 h-11 w-11 md:ml-0 md:h-8 md:w-8 md:rounded-lg",
        className,
      )}
      {...props}
    >
      <ArrowLeft className={cn("h-5 w-5 md:h-4 md:w-4", iconClassName)} aria-hidden />
    </button>
  );
});
