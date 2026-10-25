import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./Dialog.jsx";
import { AlertTriangle, HelpCircle, Trash2 } from "lucide-react";
import { Button } from "./Button.jsx";
import { cn } from "../lib/utils.js";

// Tinted icon tile + confirm button variant per tone.
const TONES = {
  destructive: { tile: "bg-[hsl(var(--destructive))]/12 text-[hsl(var(--destructive))]", halo: "bg-[hsl(var(--destructive))]/6", button: "destructive", icon: Trash2 },
  warning: { tile: "bg-amber-500/12 text-amber-600 dark:text-amber-400", halo: "bg-amber-500/8", button: "default", icon: AlertTriangle },
  primary: { tile: "bg-primary/12 text-primary", halo: "bg-primary/8", button: "default", icon: HelpCircle },
};

// Every confirmation gets an icon (the tone's own unless `icon` is passed) and a
// comfortable width (`size`, default "lg"): small bare dialogs are not used.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  detail,
  children,
  onConfirm,
  confirmLabel = "Confirmar",
  cancelLabel = "Cancelar",
  loading = false,
  icon = null,
  tone = "destructive",
  size = "lg",
  confirmDisabled = false,
}) {
  const palette = TONES[tone] ?? TONES.destructive;
  const Icon = icon ?? palette.icon;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size={size}>
        <DialogHeader>
          <div className="flex items-start gap-5 py-1">
            <span className={cn("flex h-16 w-16 shrink-0 items-center justify-center rounded-full", palette.halo)} aria-hidden="true">
              <span className={cn("flex h-12 w-12 items-center justify-center rounded-full", palette.tile)}>
                <Icon className="h-6 w-6" />
              </span>
            </span>
            <div className="min-w-0 flex-1 space-y-2 pt-1">
              <DialogTitle className="text-lg">{title}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </div>
          </div>
          {detail && (
            <p className="mt-1.5 rounded-md bg-white/5 px-3 py-2 text-sm font-medium text-[hsl(var(--foreground))] break-all border border-white/10">
              {detail}
            </p>
          )}
        </DialogHeader>
        {children && <div className="-mt-1 md:pl-[5.25rem]">{children}</div>}
        <DialogFooter className="gap-2 pt-2 sm:gap-3">
          <Button
            variant="outline"
            className="min-w-28"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button variant={palette.button} className="min-w-28" onClick={onConfirm} disabled={loading || confirmDisabled}>
            {loading ? "Procesando..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
