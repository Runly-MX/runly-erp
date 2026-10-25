// "Recordarme de esto": a short list of times. A popover next to the message on desktop,
// a bottom sheet on touch (same split as the reaction picker). Spec
// docs/superpowers/specs/2026-10-26-saved-and-reminders-design.md.
import { Popover, PopoverAnchor, PopoverContent, Sheet, SheetContent, SheetHeader, SheetTitle, useCoarsePointer } from "@runly/ui";
import { BellRing } from "lucide-react";
import { reminderOptions, remindText } from "../lib/reminderOptions";

function Options({ onPick }) {
  const options = reminderOptions();
  return (
    <ul className="p-1" aria-label="Recordarme">
      {options.map((option) => (
        <li key={option.key}>
          <button type="button" onClick={() => onPick(option.iso)} className="flex w-full cursor-pointer items-center justify-between gap-6 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-[hsl(var(--muted))] [@media(pointer:coarse)]:min-h-12">
            <span>{option.label}</span>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">{remindText(option.iso)}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function MessageReminderPicker({ open, onOpenChange, onPick, children }) {
  const coarse = useCoarsePointer();
  const pick = (iso) => { onPick(iso); onOpenChange(false); };
  if (coarse) {
    return (
      <>
        {children}
        <Sheet open={open} onOpenChange={onOpenChange}>
          <SheetContent side="bottom" className="p-0 gap-0" style={{ zIndex: 10001 }}>
            <SheetHeader className="px-4 pt-3.5 pb-1"><SheetTitle className="flex items-center gap-2 text-sm"><BellRing className="h-4 w-4" aria-hidden /> Recordarme de este mensaje</SheetTitle></SheetHeader>
            <Options onPick={pick} />
          </SheetContent>
        </Sheet>
      </>
    );
  }
  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{children}</PopoverAnchor>
      <PopoverContent side="top" align="end" sideOffset={6} className="w-64 p-0" style={{ zIndex: 10001 }} onOpenAutoFocus={(event) => event.preventDefault()}>
        <p className="px-3 pb-0 pt-2.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">Recordarme de este mensaje</p>
        <Options onPick={pick} />
      </PopoverContent>
    </Popover>
  );
}
