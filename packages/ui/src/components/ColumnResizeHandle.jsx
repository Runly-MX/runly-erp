import { cn } from "../lib/utils.js";

// Drag edge of a table header cell (the <th> needs `relative`). Spread the
// props from useColumnResize().handleProps(key). Double click restores the
// automatic widths; arrow keys nudge when focused.
export function ColumnResizeHandle({ className, ...props }) {
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Cambiar ancho de la columna"
      tabIndex={0}
      title="Arrastra para cambiar el ancho. Doble clic para restablecer."
      className={cn(
        "group/resize absolute right-0 top-0 z-10 flex h-full w-2 cursor-col-resize touch-none select-none justify-center focus-visible:outline-none",
        className,
      )}
      {...props}
    >
      <span className="h-full w-px bg-transparent transition-colors group-hover/resize:bg-[hsl(var(--border))] group-focus-visible/resize:bg-[hsl(var(--ring))] group-active/resize:bg-[hsl(var(--ring))]" />
    </span>
  );
}
