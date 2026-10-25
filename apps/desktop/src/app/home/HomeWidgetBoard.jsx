// The Home board. Normal mode just shows the widgets. Edit mode ("Personalizar") lets the
// person add widgets from a tray, drag them by their handle (dnd-kit: mouse, touch and
// keyboard) and resize them by their corner (drag, or arrow keys) over a 3-column grid.
import { useRef, useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors } from "@dnd-kit/core";
import { SortableContext, rectSortingStrategy, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button } from "@runly/ui";
import { GripVertical, MoveDiagonal2, Plus, SlidersHorizontal, X } from "lucide-react";
import { sizeFromDrag, sizeFromKey } from "../../lib/homeWidgets";

const GRID = "grid grid-cols-1 gap-3 md:grid-cols-2 md:auto-rows-[15rem] xl:grid-cols-3";
const COL_SPAN = { 1: "", 2: "md:col-span-2", 3: "md:col-span-2 xl:col-span-3" };
const ROW_SPAN = { 1: "", 2: "md:row-span-2" };
const HANDLE = "flex h-9 w-9 touch-none items-center justify-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--muted-foreground))] shadow-sm transition-colors hover:text-[hsl(var(--foreground))] [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11";

function sizeText(size) {
  return `${size.w} ${size.w === 1 ? "columna" : "columnas"} x ${size.h} ${size.h === 1 ? "fila" : "filas"}`;
}

function BoardItem({ widget, module, size, editing, onRemove, onResize }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: widget.id, disabled: !editing });
  const cellRef = useRef(null);
  // While the corner is dragged the widget stays put and a frame shows what it will cover.
  const [ghost, setGhost] = useState(null);
  const shown = size;
  // Latest size, updated at once: two quick key presses must not both start from the old one.
  const latest = useRef(size);
  latest.current = size;
  const { Component } = widget;

  // Corner drag: the size of one cell is measured from the widget itself (its size / cells spanned).
  function startResize(event) {
    event.preventDefault();
    event.stopPropagation();
    const rect = cellRef.current.getBoundingClientRect();
    const gap = 12;
    const cell = { width: (rect.width + gap) / size.w, height: (rect.height + gap) / size.h };
    const origin = { x: event.clientX, y: event.clientY };
    const read = (e) => sizeFromDrag(size, { x: e.clientX - origin.x, y: e.clientY - origin.y }, cell);
    const frame = (next) => ({ ...next, width: next.w * cell.width - gap, height: next.h * cell.height - gap });
    setGhost(frame(size));
    const move = (e) => setGhost(frame(read(e)));
    const finish = (e) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      const final = read(e);
      setGhost(null);
      if (final.w !== size.w || final.h !== size.h) onResize(final);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  function resizeByKey(event) {
    const base = latest.current;
    const next = sizeFromKey(base, event.key);
    if (next.w === base.w && next.h === base.h) return;
    event.preventDefault();
    latest.current = next;
    onResize(next);
  }

  return (
    <div
      ref={(node) => { setNodeRef(node); cellRef.current = node; }}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={`relative min-w-0 md:h-full ${COL_SPAN[shown.w]} ${ROW_SPAN[shown.h]} ${isDragging ? "z-20 opacity-90" : ""} ${editing ? "rounded-2xl outline-2 -outline-offset-2 outline-dashed outline-[hsl(var(--border))]" : ""}`}
    >
      <div className={editing ? "pointer-events-none h-full select-none opacity-70" : "h-full"}><Component module={module} /></div>
      {ghost && (
        <div aria-hidden="true" className="pointer-events-none absolute left-0 top-0 z-30 flex items-center justify-center rounded-2xl border-2 border-(--brand-primary) bg-(--brand-primary)/10 transition-[width,height] duration-100 ease-out motion-reduce:transition-none" style={{ width: ghost.width, height: ghost.height }}>
          <span className="rounded-md bg-(--brand-primary) px-2.5 py-1 text-sm font-semibold tabular-nums text-(--brand-primary-foreground)">{ghost.w} x {ghost.h}</span>
        </div>
      )}
      {editing && (
        <>
          <button type="button" ref={setActivatorNodeRef} {...attributes} {...listeners} className={`${HANDLE} absolute left-2 top-2 z-10 cursor-grab active:cursor-grabbing`} aria-label={`Mover ${widget.title}`} title="Arrastrar para mover (con el teclado: espacio y flechas)">
            <GripVertical size={16} aria-hidden />
          </button>
          <button type="button" onClick={onRemove} className={`${HANDLE} absolute right-2 top-2 z-10 cursor-pointer`} aria-label={`Quitar ${widget.title}`} title="Quitar">
            <X size={16} aria-hidden />
          </button>
          <button
            type="button"
            onPointerDown={startResize}
            onKeyDown={resizeByKey}
            className={`${HANDLE} absolute bottom-2 right-2 z-10 cursor-nwse-resize`}
            aria-label={`Tamaño de ${widget.title}: ${sizeText(size)}. Usa las flechas para cambiarlo`}
            title={`Tamaño: ${sizeText(size)}`}
          >
            <MoveDiagonal2 size={16} aria-hidden />
          </button>
        </>
      )}
    </div>
  );
}

// "Personalizar" toggle and, while editing, the tray with the widgets not yet on the board.
export function HomeWidgetEditBar({ editing, onToggle, tray, onAdd, where = "Inicio" }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          {editing ? "Arrastra por el asa para ordenar y usa la esquina para cambiar el tamaño." : ""}
        </p>
        <Button variant={editing ? "default" : "outline"} size="sm" className="gap-1.5" onClick={onToggle} aria-pressed={editing}>
          <SlidersHorizontal size={14} aria-hidden /> {editing ? "Listo" : "Personalizar"}
        </Button>
      </div>
      {editing && (
        <section aria-label="Widgets disponibles" className="rounded-2xl border border-dashed border-[hsl(var(--border))] p-3">
          <p className="mb-2 text-sm font-medium text-[hsl(var(--foreground))]">Agregar a {where}</p>
          {tray.length === 0 ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Ya agregaste todo lo disponible de los módulos a los que tienes acceso.</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {tray.map((widget) => (
                <li key={widget.id}>
                  <button type="button" onClick={() => onAdd(widget.id)} title={widget.description} className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 text-sm transition-colors hover:bg-(--brand-primary)/10 [@media(pointer:coarse)]:min-h-11">
                    <Plus size={14} aria-hidden /> {widget.title}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  );
}

export function HomeWidgetBoard({ widgets, modulesByKey, sizeOfId, editing = false, onReorder, onRemove, onResize, onEdit }) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  if (widgets.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-[hsl(var(--border))] px-4 py-10 text-center">
        <p className="text-sm font-medium text-[hsl(var(--foreground))]">Tu inicio está vacío</p>
        <p className="max-w-md text-sm text-[hsl(var(--muted-foreground))]">Agrega los resúmenes que quieras ver: tareas, agenda, aprobaciones y los de tus módulos. Solo aparecen los de módulos a los que tienes acceso.</p>
        {!editing && <Button size="sm" className="gap-1.5" onClick={onEdit}><Plus size={14} aria-hidden /> Agregar widgets</Button>}
      </div>
    );
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={({ active, over }) => { if (over && active.id !== over.id) onReorder(active.id, over.id); }}>
      <SortableContext items={widgets.map((w) => w.id)} strategy={rectSortingStrategy}>
        <div className={GRID}>
          {widgets.map((widget) => (
            <BoardItem
              key={widget.id}
              widget={widget}
              module={modulesByKey.get(widget.moduleKey) ?? modulesByKey.get(widget.displayModuleKey)}
              size={sizeOfId(widget.id)}
              editing={editing}
              onRemove={() => onRemove(widget.id)}
              onResize={(size) => onResize(widget.id, size)}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
