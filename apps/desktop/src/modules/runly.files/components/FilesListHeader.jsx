import { useRef } from "react";
import { Checkbox, cn } from "@runly/ui";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";
import { COLUMN_DEFAULTS, gridTemplate } from "../hooks/useFilesColumns";

// Server-side sort keys for each column.
const SORT_KEYS = { name: "originalName", modified: "updatedAt", kind: "mimeType", size: "sizeBytes" };

// Every visible header sorts (click toggles asc/desc) and, except the name,
// resizes by dragging its right edge; double-click the edge to reset the width.
// The edge after "Nombre" resizes the next column from the other side, since the
// name column simply takes the remaining space.
export function FilesListHeader({ layout, columns, allSelected, onToggleAll, sort, onSortChange }) {
  const dragging = useRef(false);

  function startResize(col, event, invert = false) {
    event.preventDefault();
    event.stopPropagation();
    dragging.current = true;
    const startX = event.clientX;
    const start = columns.widths[col];
    const move = (e) => columns.setWidth(col, start + (invert ? -1 : 1) * (e.clientX - startX));
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      // The click that ends a resize must not also change the sort.
      setTimeout(() => (dragging.current = false), 0);
    };
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }

  const cell = (label, col, { align = "left", handleFor, invert } = {}) => {
    const key = SORT_KEYS[col];
    const active = sort.by === key;
    const Icon = active ? (sort.dir === "asc" ? ArrowUp : ArrowDown) : ChevronsUpDown;
    return (
      <div role="columnheader" aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className="relative flex min-w-0 items-center">
        <button
          type="button"
          onClick={() => !dragging.current && onSortChange({ by: key, dir: active && sort.dir === "asc" ? "desc" : "asc" })}
          className={cn(
            "group flex min-w-0 flex-1 items-center gap-1 rounded px-1 py-2 text-xs font-medium text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]",
            align === "right" && "justify-end",
            active && "text-[hsl(var(--foreground))]",
          )}
        >
          <span className="truncate">{label}</span>
          <Icon className={cn("h-3 w-3 shrink-0", !active && "opacity-0 group-hover:opacity-60")} />
        </button>
        {handleFor && (
          <span
            role="separator"
            aria-orientation="vertical"
            aria-label={`Cambiar el ancho de ${label}`}
            title="Arrastra para cambiar el ancho; doble clic para restablecer"
            onPointerDown={(e) => startResize(handleFor, e, invert)}
            onDoubleClick={() => columns.reset(handleFor)}
            onClick={(e) => e.stopPropagation()}
            className="absolute -right-2 top-1 bottom-1 z-10 flex w-4 cursor-col-resize touch-none items-center justify-center"
          >
            <span className="h-full w-px bg-[hsl(var(--border))] transition-colors hover:w-0.5 hover:bg-[var(--brand-primary)]" />
          </span>
        )}
      </div>
    );
  };

  // The edge after the name column resizes the first visible fixed column.
  const first = layout.showModified ? "modified" : null;
  return (
    <div
      role="row"
      className="grid items-center gap-2 border-b border-[hsl(var(--border))] px-3"
      style={{ gridTemplateColumns: gridTemplate(layout, columns.widths) }}
    >
      <div className="-m-2 flex h-11 w-11 items-center justify-center">
        <Checkbox aria-label="Seleccionar todo" checked={allSelected} onCheckedChange={onToggleAll} />
      </div>
      {cell("Nombre", "name", first ? { handleFor: first, invert: true } : {})}
      {layout.showModified && cell("Modificado", "modified", { handleFor: "modified" })}
      {layout.showKind && cell("Tipo", "kind", { handleFor: "kind" })}
      {layout.showSize && cell("Tamaño", "size", { align: "right", handleFor: "size" })}
      {layout.coarse && <span />}
      <span />
    </div>
  );
}

export { COLUMN_DEFAULTS };
