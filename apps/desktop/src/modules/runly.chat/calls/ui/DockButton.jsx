import { forwardRef } from "react";
import { ChevronUp } from "lucide-react";
import { cn, DropdownMenu, DropdownMenuTrigger, DropdownMenuContent } from "@runly/ui";

const TONES = {
  default: "text-white/90 hover:bg-white/10",
  // A device that is off (muted mic, camera off): the Meet red.
  off: "bg-(--call-danger) text-white hover:brightness-110",
  accent: "bg-(--call-accent) text-(--brand-primary-foreground) hover:bg-(--call-accent-hover)",
  hand: "bg-(--call-hand) text-amber-950 hover:brightness-105",
  danger: "bg-red-600 text-white hover:bg-red-500",
};

function Badge({ value, tone = "accent" }) {
  if (!value) return null;
  return (
    <span
      className={cn(
        "absolute -right-3.5 -top-2.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-bold ring-2 ring-(--call-stage)",
        tone === "warning" ? "bg-(--call-hand) text-amber-950" : "bg-(--call-accent) text-(--brand-primary-foreground)",
      )}
    >
      {typeof value === "number" && value > 9 ? "9+" : value}
    </span>
  );
}

// Icon + label control for the desktop dock. Labels can collapse (`compact`)
// when the stage is narrow; the tooltip (title) keeps the full action name.
export const DockButton = forwardRef(function DockButton(
  { icon: Icon, label, title, tone = "default", pressed, badge, badgeTone, compact = false, wide = false, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      title={title ?? label}
      aria-label={title ?? label}
      aria-pressed={pressed}
      className={cn(
        "relative flex shrink-0 flex-col items-center justify-center gap-1 rounded-xl font-medium transition-[background-color,filter,transform] duration-150 active:scale-[0.96]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--call-accent) disabled:pointer-events-none disabled:opacity-40",
        compact ? "h-11 min-w-11 px-2.5" : "h-[54px] min-w-[60px] px-2.5",
        wide && "px-4",
        TONES[tone] ?? TONES.default,
        className,
      )}
      {...props}
    >
      <span className="relative">
        <Icon className="h-5 w-5" aria-hidden />
        <Badge value={badge} tone={badgeTone} />
      </span>
      {!compact && <span className="text-[11px] leading-none">{label}</span>}
    </button>
  );
});

// Dock button with an attached chevron that opens a menu (devices, leave
// options). `menu` is the DropdownMenuContent children.
export function DockSplitButton({ menu, menuLabel, compact = false, menuClassName, ...buttonProps }) {
  const tone = buttonProps.tone ?? "default";
  return (
    <div className="flex shrink-0 items-stretch">
      <DockButton {...buttonProps} compact={compact} className={cn("rounded-r-none", buttonProps.className)} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={menuLabel}
            title={menuLabel}
            className={cn(
              "flex w-6 items-center justify-center rounded-r-xl border-l border-black/20 transition-colors",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--call-accent)",
              TONES[tone] ?? TONES.default,
            )}
          >
            <ChevronUp className="h-3.5 w-3.5" aria-hidden />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="start" sideOffset={10} className={cn("call-dialog z-60 w-72", menuClassName)}>
          {menu}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

// Round icon + label control for phones (bottom bar, 5 items max).
export const MobileCallButton = forwardRef(function MobileCallButton(
  { icon: Icon, label, tone = "default", pressed, badge, badgeTone, className, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-label={label}
      aria-pressed={pressed}
      className={cn("flex min-w-0 flex-1 flex-col items-center gap-1.5 focus-visible:outline-none", className)}
      {...props}
    >
      <span
        className={cn(
          "relative flex h-[52px] w-[52px] items-center justify-center rounded-full transition-[background-color,transform] duration-150 active:scale-[0.94]",
          tone === "default" ? "bg-white/[0.08] text-white ring-1 ring-white/10" : TONES[tone],
        )}
      >
        <Icon className="h-[22px] w-[22px]" aria-hidden />
        <Badge value={badge} tone={badgeTone} />
      </span>
      <span className="max-w-full truncate text-[11px] font-medium text-white/80">{label}</span>
    </button>
  );
});
