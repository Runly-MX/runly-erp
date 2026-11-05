// Pieces of DetailViewDesigner: droppable column, sortable card and field chip.
import * as LucideIcons from "lucide-react";
import { useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy, rectSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Eye, EyeOff, GripVertical, Trash2 } from "lucide-react";
import { Input } from "./Input.jsx";
import { SegmentedControl } from "./SegmentedControl.jsx";
import { cn } from "../lib/utils.js";

const COLUMN_OPTIONS = [{ value: 1, label: "1 col" }, { value: 2, label: "2 col" }];

export function iconFor(name) {
  return (name && LucideIcons[name]) || LucideIcons.LayoutList;
}

function useSortableStyle(id, data) {
  const sortable = useSortable({ id, data });
  const style = { transform: CSS.Translate.toString(sortable.transform), transition: sortable.transition };
  return { ...sortable, style };
}

export function FieldChip({ id, label, overlay = false }) {
  const { setNodeRef, attributes, listeners, style, isDragging } = useSortableStyle(id, { kind: "field" });
  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={overlay ? undefined : style}
      {...(overlay ? {} : attributes)}
      {...(overlay ? {} : listeners)}
      className={cn(
        "flex min-w-0 cursor-grab touch-none items-center gap-1.5 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2 py-1.5 text-sm",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
        isDragging && !overlay && "opacity-40",
        overlay && "shadow-lg",
      )}
    >
      <GripVertical className="h-3.5 w-3.5 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
      <span className="truncate">{label}</span>
    </div>
  );
}

// Field list of a card or of the "sin tarjeta" tray; also a drop target when empty.
export function FieldZone({ id, keys, labelOf, columns = 1, empty }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { kind: "zone" } });
  return (
    <SortableContext id={id} items={keys.map((key) => `f:${key}`)} strategy={columns > 1 ? rectSortingStrategy : verticalListSortingStrategy}>
      <div
        ref={setNodeRef}
        className={cn(
          "grid min-h-11 gap-1.5 rounded-md p-1.5 transition-colors",
          columns > 1 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1",
          isOver ? "bg-[hsl(var(--muted)/0.6)]" : "bg-[hsl(var(--muted)/0.25)]",
        )}
      >
        {keys.map((key) => <FieldChip key={key} id={`f:${key}`} label={labelOf(key)} />)}
        {keys.length === 0 ? <p className="col-span-full self-center px-1 text-xs text-[hsl(var(--muted-foreground))]">{empty}</p> : null}
      </div>
    </SortableContext>
  );
}

export function CardTile({ card, fields, labelOf, hidden, onChange, onRemove, onToggleHidden, overlay = false }) {
  const { setNodeRef, attributes, listeners, style, isDragging } = useSortableStyle(`s:${card.id}`, { kind: "card" });
  const Icon = iconFor(card.icon);
  return (
    <div
      ref={overlay ? undefined : setNodeRef}
      style={overlay ? undefined : style}
      className={cn(
        "rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3",
        isDragging && !overlay && "opacity-40",
        overlay && "shadow-xl",
        hidden && "opacity-60",
      )}
    >
      <div className="flex items-center gap-2">
        <button
          type="button"
          aria-label={`Mover tarjeta ${card.label}`}
          className="flex h-7 w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] pointer-coarse:h-11 pointer-coarse:w-11"
          {...(overlay ? {} : attributes)}
          {...(overlay ? {} : listeners)}
        >
          <GripVertical className="h-4 w-4" aria-hidden="true" />
        </button>
        <Icon className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
        {card.block ? (
          <span className="min-w-0 flex-1 truncate text-sm font-medium">{card.label}</span>
        ) : (
          <Input
            value={card.label}
            onChange={(event) => onChange?.({ label: event.target.value })}
            aria-label="Nombre de la tarjeta"
            maxLength={80}
            className="h-8 min-w-0 flex-1"
          />
        )}
        {card.block ? (
          <button
            type="button"
            onClick={onToggleHidden}
            aria-label={hidden ? `Mostrar ${card.label}` : `Ocultar ${card.label}`}
            title={hidden ? "Mostrar" : "Ocultar"}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] pointer-coarse:h-11 pointer-coarse:w-11"
          >
            {hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        ) : (
          <button
            type="button"
            onClick={onRemove}
            aria-label={`Quitar tarjeta ${card.label}`}
            title="Quitar tarjeta"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--destructive))] pointer-coarse:h-11 pointer-coarse:w-11"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      {card.block ? (
        <p className="mt-1.5 pl-9 text-xs text-[hsl(var(--muted-foreground))]">Sección del módulo: se puede mover u ocultar.</p>
      ) : (
        <div className="mt-2 space-y-2">
          <SegmentedControl size="sm" ariaLabel="Columnas de la tarjeta" options={COLUMN_OPTIONS} value={card.columns > 1 ? 2 : 1} onChange={(columns) => onChange?.({ columns })} />
          {overlay ? null : <FieldZone id={`z:${card.id}`} keys={fields} labelOf={labelOf} columns={card.columns} empty="Arrastra campos aquí" />}
        </div>
      )}
    </div>
  );
}

export function ColumnZone({ id, title, cardIds, children }) {
  const { setNodeRef, isOver } = useDroppable({ id, data: { kind: "column" } });
  return (
    <section className="min-w-0 space-y-2">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{title}</h3>
      <SortableContext id={id} items={cardIds.map((cardId) => `s:${cardId}`)} strategy={verticalListSortingStrategy}>
        <div ref={setNodeRef} className={cn("min-h-24 space-y-2 rounded-lg p-1 transition-colors", isOver && "bg-[hsl(var(--muted)/0.4)]")}>
          {children}
        </div>
      </SortableContext>
    </section>
  );
}
