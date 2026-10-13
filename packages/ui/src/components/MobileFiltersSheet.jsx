import { useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
} from "./Sheet.jsx";
import { Button } from "./Button.jsx";
import { cn } from "../lib/utils.js";

/**
 * MobileFiltersSheet — shows filters inside a bottom sheet on mobile.
 * On desktop the trigger button is hidden; filters render inline via `desktopFilters` prop.
 *
 * Usage:
 *   <MobileFiltersSheet activeCount={2} onClear={handleClear}>
 *     <FilterBar ... />
 *   </MobileFiltersSheet>
 */
export function MobileFiltersSheet({
  children,
  activeCount = 0,
  onClear,
  className,
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors md:hidden",
          activeCount > 0
            ? "border-(--brand-primary) bg-(--brand-soft) text-[hsl(var(--foreground))]"
            : "border-[hsl(var(--border))] bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]",
          className,
        )}
        aria-label={`Filtros${activeCount > 0 ? ` (${activeCount} activos)` : ""}`}
      >
        <SlidersHorizontal className="h-3.5 w-3.5" />
        Filtros
        {activeCount > 0 && (
          <span className="h-4 min-w-4 px-1 rounded-full bg-(--brand-primary) text-(--brand-primary-foreground) text-[10px] font-bold flex items-center justify-center leading-none">
            {activeCount}
          </span>
        )}
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" aria-describedby={undefined}>
          <SheetHeader>
            <SheetTitle>Filtros</SheetTitle>
          </SheetHeader>
          <div className="overflow-y-auto py-3 flex flex-col gap-3">
            {children}
          </div>
          <SheetFooter>
            {activeCount > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  onClear?.();
                  setOpen(false);
                }}
              >
                Limpiar
              </Button>
            )}
            <Button onClick={() => setOpen(false)}>Aplicar</Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
    </>
  );
}
