import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
} from "./Dialog.jsx";
import { Button } from "./Button.jsx";
import { cn } from "../lib/utils.js";

// Tinted icon tile + confirm button variant per tone.
const TONES = {
  destructive: { tile: "bg-[hsl(var(--destructive))]/12 text-[hsl(var(--destructive))]", button: "destructive" },
  warning: { tile: "bg-amber-500/12 text-amber-600 dark:text-amber-400", button: "default" },
  primary: { tile: "bg-[hsl(var(--primary))]/12 text-[hsl(var(--primary))]", button: "default" },
};

// `icon` (a lucide component), `tone` and `size` are optional; without them the
// dialog keeps its compact destructive look used across modules.
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
  icon: Icon = null,
  tone = "destructive",
  size = null,
  confirmDisabled = false,
}) {
  const palette = TONES[tone] ?? TONES.destructive;
  const sized = size ?? (Icon ? "md" : null);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size={sized ?? "sm"} className={sized ? undefined : "md:max-w-sm"}>
        <DialogHeader>
          <div className={cn(Icon && "flex items-start gap-4")}>
            {Icon ? (
              <span className={cn("flex h-11 w-11 shrink-0 items-center justify-center rounded-full", palette.tile)} aria-hidden="true">
                <Icon className="h-5 w-5" />
              </span>
            ) : null}
            <div className="min-w-0 flex-1 space-y-1.5">
              <DialogTitle>{title}</DialogTitle>
              {description && <DialogDescription>{description}</DialogDescription>}
            </div>
          </div>
          {detail && (
            <p className="mt-1.5 rounded-md bg-white/5 px-3 py-2 text-sm font-medium text-[hsl(var(--foreground))] break-all border border-white/10">
              {detail}
            </p>
          )}
        </DialogHeader>
        {children && <div className={cn("-mt-1", Icon && "md:pl-15")}>{children}</div>}
        <DialogFooter className="gap-2 sm:gap-3">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            {cancelLabel}
          </Button>
          <Button variant={palette.button} onClick={onConfirm} disabled={loading || confirmDisabled}>
            {loading ? "Procesando..." : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
