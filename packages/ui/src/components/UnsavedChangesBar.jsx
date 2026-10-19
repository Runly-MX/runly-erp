import { Button } from "./Button.jsx";
import { cn } from "../lib/utils.js";

// Sticky "you have unsaved changes" bar shared by editor screens (role
// permissions, per-user grants, ...). Stacks vertically below `sm` so the
// label and both buttons never overlap on a phone, and clears the mobile
// bottom nav / home indicator via var(--sab).
//
// On mobile the primary action ("Guardar") sits on top (flex-col-reverse);
// on `sm+` it reads left-to-right as Descartar -> Guardar.
export function UnsavedChangesBar({
  message = "Cambios sin guardar",
  saving = false,
  onDiscard,
  onSave,
  discardLabel = "Descartar",
  saveLabel = "Guardar",
  savingLabel = "Guardando...",
  className,
}) {
  return (
    <div
      className={cn(
        "sticky bottom-0 z-30 pt-2 pb-[max(1rem,var(--sab))]",
        className,
      )}
    >
      <div className="glass-strong flex flex-col gap-3 rounded-2xl border border-[hsl(var(--border))] px-4 py-3.5 shadow-2xl sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-sm font-medium text-[hsl(var(--foreground))]">
          {message}
        </p>
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:shrink-0 sm:items-center">
          <Button
            size="sm"
            variant="outline"
            disabled={saving}
            onClick={onDiscard}
            className="w-full sm:w-auto"
          >
            {discardLabel}
          </Button>
          <Button
            size="sm"
            disabled={saving}
            onClick={onSave}
            className="w-full sm:w-auto"
          >
            {saving ? savingLabel : saveLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
