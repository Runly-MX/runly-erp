import { Search } from "lucide-react";
import { cn } from "../lib/utils.js";

// Magnifier shown next to a detail value. Clicking it asks the host screen to
// open the list filtered by "<field label>: <value>" (exact match).
export function FilterByValueButton({ label, value, onClick, className }) {
  return (
    <button
      type="button"
      title={`Ver todos con ${label}: ${value}`}
      aria-label={`Filtrar por ${label}: ${value}`}
      onClick={onClick}
      className={cn(
        "inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        className,
      )}
    >
      <Search className="h-3.5 w-3.5" />
    </button>
  );
}
