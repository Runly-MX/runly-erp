import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "./Sheet.jsx";
import { cn } from "../lib/utils.js";

// Touch counterpart of the viewer's right-click menu: a bottom sheet with
// large, labelled actions grouped like the context menu. `actions` is
// [{ key, label, icon, onSelect, disabled, group }].
export function ViewerActionsSheet({ open, onOpenChange, title, actions, zIndex = 60 }) {
  const groups = [];
  for (const action of actions) {
    const last = groups[groups.length - 1];
    if (last && last.name === action.group) last.items.push(action);
    else groups.push({ name: action.group, items: [action] });
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="gap-3" style={{ zIndex }}>
        <SheetHeader className="text-left">
          <SheetTitle className="truncate text-base">{title || "Archivo"}</SheetTitle>
          <SheetDescription className="sr-only">Acciones del archivo</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 pb-1">
          {groups.map((group, gi) => (
            <div key={group.name ?? gi} className={cn("grid grid-cols-4 gap-1", gi > 0 && "border-t border-[hsl(var(--border))] pt-3")}>
              {group.items.map(({ key, label, icon: Icon, onSelect, disabled }) => (
                <button
                  key={key}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    onOpenChange(false);
                    onSelect?.();
                  }}
                  className="flex flex-col items-center gap-1.5 rounded-xl p-2 text-center transition-colors active:bg-[hsl(var(--muted))] disabled:opacity-40"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]">
                    <Icon className="h-5 w-5" aria-hidden />
                  </span>
                  <span className="text-[11px] leading-tight text-[hsl(var(--foreground))]">{label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
