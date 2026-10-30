// Gantt of a project: bars you drag to move or resize, finish-to-start dependency arrows
// you draw from a bar's right end onto another bar, a today line, three zooms and a strip
// with the tasks that have no dates yet (drop one on a day to schedule it). Works with
// mouse, touch and keyboard (Alt+arrows on a focused bar). Spec
// docs/superpowers/specs/2026-10-26-projects-depth-design.md, section 1.
import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmDialog, EmptyState, LoadingState } from "@runly/ui";
import { CalendarOff, CornerDownRight, Link2, TriangleAlert, ZoomIn, ZoomOut } from "lucide-react";
import { toast } from "sonner";
import { useGantt, useGanttDependencies, useRescheduleTask } from "../hooks/useProjectsData";
import {
  BAR_HEIGHT, ROW_HEIGHT, ZOOMS, arrowPath, barBox, breaksOrder, buildRange, dayNumber, dayOfX, dayText, deltaDays, dragSpan, headerTicks, monthBands, taskSpan, xOfDay,
} from "../lib/ganttLayout";

const HEADER_HEIGHT = 56;
const LIST_WIDTH = 224;
const ZOOM_ORDER = ["day", "week", "month"];
const cx = (...parts) => parts.filter(Boolean).join(" ");

// eslint-disable-next-line no-restricted-syntax -- "today" as a UTC calendar day, like the task dates
const todayNumber = () => dayNumber(new Date().toISOString());

function sortRows(tasks) {
  const bySpan = (a, b) => (taskSpan(a)?.start ?? 0) - (taskSpan(b)?.start ?? 0) || a.position - b.position;
  const parents = tasks.filter((task) => !task.parentTaskId).sort(bySpan);
  const rows = [];
  for (const parent of parents) {
    rows.push(parent);
    rows.push(...tasks.filter((task) => task.parentTaskId === parent.id).sort(bySpan));
  }
  const placed = new Set(rows.map((row) => row.id));
  rows.push(...tasks.filter((task) => !placed.has(task.id)).sort(bySpan));
  return rows;
}

export default function GanttView({ projectId, onTaskClick, canEdit = true }) {
  const { data, isLoading } = useGantt(projectId);
  const reschedule = useRescheduleTask(projectId);
  const links = useGanttDependencies(projectId);
  const [zoom, setZoom] = useState("day");
  const [drag, setDrag] = useState(null); // { id, mode, startX, delta }
  const [link, setLink] = useState(null); // { fromId, x, y }
  const [pickFrom, setPickFrom] = useState(null); // click-to-link: the blocker waiting for a target bar
  const [askRemove, setAskRemove] = useState(null);
  const timelineRef = useRef(null);
  const dayWidth = ZOOMS[zoom].dayWidth;

  useEffect(() => {
    if (!pickFrom) return undefined;
    const onKey = (e) => { if (e.key === "Escape") setPickFrom(null); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickFrom]);

  const tasks = data?.tasks ?? [];
  const dependencies = data?.dependencies ?? [];
  const dated = useMemo(() => sortRows(tasks.filter((task) => taskSpan(task))), [tasks]);
  const undated = useMemo(() => tasks.filter((task) => !taskSpan(task) && !task.status?.isDone), [tasks]);
  const today = todayNumber();
  const { origin, days } = useMemo(() => buildRange(dated, today), [dated, today]);
  const width = days * dayWidth;

  // The span shown for a task: its real dates, or the live ones while it is being dragged.
  const spanOf = (task) => {
    const span = taskSpan(task);
    return drag && drag.id === task.id && span ? dragSpan(span, drag.mode, drag.delta) : span;
  };
  const boxes = useMemo(() => {
    const map = new Map();
    dated.forEach((task, index) => { const span = spanOf(task); if (span) map.set(task.id, { span, box: barBox(span, origin, dayWidth, index) }); });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dated, drag, origin, dayWidth]);

  function commit(task, span) {
    const before = taskSpan(task);
    if (!before || (before.start === span.start && before.end === span.end)) return;
    reschedule.mutate({ taskId: task.id, startDate: dayText(span.start), dueDate: dayText(span.end) }, {
      onSuccess: () => {
        const later = span.end - before.end;
        const dependents = dependencies.filter((dep) => dep.blockerId === task.id).length;
        if (later > 0 && dependents > 0) {
          toast("Las tareas que dependen de esta no se movieron", {
            action: { label: "Moverlas también", onClick: () => reschedule.mutate({ taskId: task.id, startDate: dayText(span.start), dueDate: dayText(span.end), pushDependentsBy: later }) },
            duration: 8000,
          });
        }
      },
    });
  }

  function finishPick(task) {
    if (task.id !== pickFrom) links.add.mutate({ blockedId: task.id, blockerId: pickFrom });
    setPickFrom(null);
  }

  function startDrag(event, task, mode) {
    if (!canEdit || (event.pointerType === "mouse" && event.button !== 0)) return;
    event.stopPropagation();
    if (pickFrom) { event.preventDefault(); finishPick(task); return; }
    event.currentTarget.setPointerCapture?.(event.pointerId);
    const origin0 = event.clientX;
    let moved = false;
    const state = { id: task.id, mode, delta: 0 };
    setDrag(state);
    const move = (e) => {
      const delta = deltaDays(e.clientX - origin0, dayWidth);
      if (Math.abs(e.clientX - origin0) > 4) moved = true;
      state.delta = delta;
      setDrag({ ...state });
    };
    const finish = (e) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      setDrag(null);
      if (!moved) { if (e.type === "pointerup") onTaskClick?.(task.id); return; }
      if (e.type === "pointerup") commit(task, dragSpan(taskSpan(task), mode, deltaDays(e.clientX - origin0, dayWidth)));
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  function onBarKey(event, task) {
    if (!canEdit || !event.altKey || !event.key.startsWith("Arrow")) {
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onTaskClick?.(task.id); }
      return;
    }
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (!step) return;
    event.preventDefault();
    commit(task, dragSpan(taskSpan(task), event.shiftKey ? "end" : "move", step));
  }

  function startLink(event, task) {
    if (!canEdit) return;
    event.preventDefault();
    event.stopPropagation();
    const rect = timelineRef.current.getBoundingClientRect();
    const point = (e) => ({ x: e.clientX - rect.left, y: e.clientY - rect.top - HEADER_HEIGHT });
    const origin0 = { x: event.clientX, y: event.clientY };
    let moved = false;
    setLink({ fromId: task.id, ...point(event) });
    const move = (e) => {
      if (Math.hypot(e.clientX - origin0.x, e.clientY - origin0.y) > 4) moved = true;
      setLink({ fromId: task.id, ...point(e) });
    };
    const finish = (e) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", finish);
      setLink(null);
      // A plain click (no drag) arms click-to-link: the next bar clicked waits for this one.
      if (e.type === "pointerup" && !moved) { setPickFrom((current) => (current === task.id ? null : task.id)); return; }
      const target = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-gantt-task]")?.getAttribute("data-gantt-task");
      if (e.type === "pointerup" && target && target !== task.id) links.add.mutate({ blockedId: target, blockerId: task.id });
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", finish);
  }

  function dropUndated(event) {
    event.preventDefault();
    const id = event.dataTransfer.getData("text/plain");
    const rect = timelineRef.current.getBoundingClientRect();
    const day = dayOfX(event.clientX - rect.left, origin, dayWidth);
    if (id && canEdit) reschedule.mutate({ taskId: id, startDate: dayText(day), dueDate: dayText(day) });
  }

  if (isLoading) return <LoadingState />;
  if (tasks.length === 0) return <EmptyState icon={CalendarOff} title="Sin tareas" description="Este proyecto no tiene tareas todavía." />;

  const ticks = headerTicks(origin, days, dayWidth, zoom);
  const bands = monthBands(origin, days, dayWidth);
  const bodyHeight = Math.max(dated.length, 1) * ROW_HEIGHT;
  const zoomIndex = ZOOM_ORDER.indexOf(zoom);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-[hsl(var(--border))] px-3 py-2">
        <div role="group" aria-label="Escala del tiempo" className="inline-flex rounded-md border border-[hsl(var(--border))] p-0.5">
          {ZOOM_ORDER.map((key) => (
            <button key={key} type="button" aria-pressed={zoom === key} onClick={() => setZoom(key)} className={cx("cursor-pointer rounded-sm px-3 py-1 text-sm transition-colors [@media(pointer:coarse)]:min-h-10", zoom === key ? "bg-(--brand-primary)/15 font-medium" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]")}>{ZOOMS[key].label}</button>
          ))}
        </div>
        <button type="button" aria-label="Alejar" disabled={zoomIndex === ZOOM_ORDER.length - 1} onClick={() => setZoom(ZOOM_ORDER[zoomIndex + 1])} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-[hsl(var(--muted))] disabled:opacity-30 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10"><ZoomOut size={16} aria-hidden /></button>
        <button type="button" aria-label="Acercar" disabled={zoomIndex === 0} onClick={() => setZoom(ZOOM_ORDER[zoomIndex - 1])} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md hover:bg-[hsl(var(--muted))] disabled:opacity-30 [@media(pointer:coarse)]:h-10 [@media(pointer:coarse)]:w-10"><ZoomIn size={16} aria-hidden /></button>
        <p className="ml-auto hidden text-xs text-[hsl(var(--muted-foreground))] md:block">Arrastra una barra para moverla o su borde para cambiar la duración · usa el icono de enlace al final de la barra para crear una dependencia</p>
      </div>

      {pickFrom && (
        <div role="status" className="flex shrink-0 items-center gap-2 border-b border-[hsl(var(--border))] bg-(--brand-primary)/10 px-3 py-2 text-sm">
          <Link2 size={14} className="shrink-0" aria-hidden />
          <span className="min-w-0 flex-1 truncate">
            Elige la tarea que empezará cuando termine «{tasks.find((t) => t.id === pickFrom)?.title ?? "esta tarea"}»
          </span>
          <button type="button" onClick={() => setPickFrom(null)} className="shrink-0 cursor-pointer rounded-md px-2 py-1 text-xs hover:bg-[hsl(var(--muted))]">Cancelar</button>
        </div>
      )}

      {undated.length > 0 && (
        <div className="shrink-0 border-b border-[hsl(var(--border))] px-3 py-2">
          <p className="mb-1.5 text-xs font-medium text-[hsl(var(--muted-foreground))]">Sin fecha · arrastra una al calendario para programarla</p>
          <ul className="flex max-h-20 flex-wrap gap-1.5 overflow-y-auto">
            {undated.map((task) => (
              <li key={task.id}>
                <button
                  type="button" draggable={canEdit}
                  onDragStart={(e) => { e.dataTransfer.setData("text/plain", task.id); e.dataTransfer.effectAllowed = "move"; }}
                  onClick={() => onTaskClick?.(task.id)}
                  className="max-w-[16rem] cursor-grab truncate rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2.5 py-1 text-sm hover:bg-[hsl(var(--muted))] [@media(pointer:coarse)]:min-h-10"
                >
                  {task.title}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {dated.length === 0 ? (
        <EmptyState icon={CalendarOff} title="Ninguna tarea tiene fecha" description="Arrastra una tarea de «Sin fecha» al calendario, o ponle fecha de inicio o de entrega." />
      ) : (
        <div className="relative min-h-0 flex-1 overflow-auto overscroll-contain" data-testid="gantt-scroll">
          <div className="flex" style={{ width: LIST_WIDTH + width, minHeight: HEADER_HEIGHT + bodyHeight }}>
            <div className="sticky left-0 z-20 shrink-0 border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]" style={{ width: LIST_WIDTH }}>
              <div className="sticky top-0 z-30 flex items-end border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 pb-2 text-xs font-medium text-[hsl(var(--muted-foreground))]" style={{ height: HEADER_HEIGHT }}>Tarea</div>
              {dated.map((task) => (
                <button key={task.id} type="button" onClick={() => (pickFrom ? finishPick(task) : onTaskClick?.(task.id))} style={{ height: ROW_HEIGHT }}
                  className={cx("flex w-full cursor-pointer items-center gap-1 border-b border-[hsl(var(--border))] px-3 text-left text-sm hover:bg-[hsl(var(--muted))]/50", task.parentTaskId && "pl-6")}>
                  {task.parentTaskId && <CornerDownRight size={11} className="shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden />}
                  <span className={cx("truncate", task.status?.isDone && "text-[hsl(var(--muted-foreground))] line-through")}>{task.title}</span>
                </button>
              ))}
            </div>

            <div ref={timelineRef} className="relative" style={{ width }} onDragOver={(e) => { if (canEdit) e.preventDefault(); }} onDrop={dropUndated}>
              <div className="sticky top-0 z-10 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]" style={{ height: HEADER_HEIGHT }}>
                <div className="relative h-7">
                  {bands.map((band) => <span key={band.x} className="absolute top-0 flex h-7 items-center truncate border-l border-[hsl(var(--border))] px-2 text-xs font-medium" style={{ left: band.x, width: band.width }}>{band.label}</span>)}
                </div>
                <div className="relative h-7">
                  {ticks.map((tick) => (
                    <span key={tick.x} className={cx("absolute top-0 flex h-7 flex-col items-center justify-center border-l border-[hsl(var(--border))]/60 text-[10px] leading-3 text-[hsl(var(--muted-foreground))]", tick.weekend && "bg-[hsl(var(--muted))]/40")} style={{ left: tick.x, width: zoom === "day" ? dayWidth : undefined, paddingLeft: zoom === "day" ? 0 : 4 }}>
                      {tick.sub && <span>{tick.sub}</span>}<span>{tick.label}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="relative" style={{ height: bodyHeight }}>
                {ticks.map((tick) => <span key={tick.x} aria-hidden="true" className={cx("absolute top-0 h-full border-l", tick.weekend ? "border-transparent bg-[hsl(var(--muted))]/30" : "border-[hsl(var(--border))]/40")} style={{ left: tick.x, width: tick.weekend ? dayWidth : 0 }} />)}
                {dated.map((task, index) => <span key={task.id} aria-hidden="true" className="absolute left-0 w-full border-b border-[hsl(var(--border))]/60" style={{ top: index * ROW_HEIGHT, height: ROW_HEIGHT }} />)}
                <span aria-hidden="true" className="absolute top-0 z-10 h-full w-px bg-red-500" style={{ left: xOfDay(today, origin, dayWidth) + dayWidth / 2 }} title="Hoy" />

                <svg className="pointer-events-none absolute left-0 top-0 z-10 overflow-visible" width={width} height={bodyHeight} aria-hidden="true">
                  <defs>
                    <marker id="gantt-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1 L9 5 L0 9 z" className="fill-[hsl(var(--muted-foreground))]" /></marker>
                    <marker id="gantt-arrow-bad" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1 L9 5 L0 9 z" className="fill-red-600" /></marker>
                  </defs>
                  {dependencies.map((dep) => {
                    const from = boxes.get(dep.blockerId);
                    const to = boxes.get(dep.blockedId);
                    if (!from || !to) return null;
                    const bad = breaksOrder(from.span, to.span);
                    return (
                      <g key={dep.id}>
                        <path d={arrowPath(from.box, to.box).d} fill="none" strokeWidth="1.5" className={bad ? "stroke-red-600" : "stroke-[hsl(var(--muted-foreground))]"} markerEnd={`url(#gantt-arrow${bad ? "-bad" : ""})`} />
                        {canEdit && <path d={arrowPath(from.box, to.box).d} fill="none" stroke="transparent" strokeWidth="14" className="pointer-events-stroke cursor-pointer" onClick={() => setAskRemove(dep)}><title>Clic para quitar la dependencia</title></path>}
                      </g>
                    );
                  })}
                  {link && boxes.get(link.fromId) && (
                    <path d={`M ${boxes.get(link.fromId).box.x + boxes.get(link.fromId).box.width} ${boxes.get(link.fromId).box.y + BAR_HEIGHT / 2} L ${link.x} ${link.y}`} fill="none" strokeWidth="2" strokeDasharray="5 4" className="stroke-(--brand-primary)" />
                  )}
                </svg>

                {dated.map((task) => {
                  const entry = boxes.get(task.id);
                  if (!entry) return null;
                  const { box, span } = entry;
                  const blockedEarly = dependencies.some((dep) => dep.blockedId === task.id && breaksOrder(boxes.get(dep.blockerId)?.span, span));
                  const color = task.status?.color ?? "#6366f1";
                  const dragging = drag?.id === task.id;
                  return (
                    <div key={task.id} data-gantt-task={task.id} className="group/bar absolute z-20" style={{ left: box.x, top: box.y, width: box.width, height: box.height }}>
                      <button
                        type="button"
                        onPointerDown={(e) => startDrag(e, task, "move")}
                        onKeyDown={(e) => onBarKey(e, task)}
                        aria-label={`${task.title}, del ${dayText(span.start)} al ${dayText(span.end)}${blockedEarly ? ", empieza antes de que termine la tarea que la bloquea" : ""}. Alt y flechas para mover`}
                        className={cx("flex h-full w-full touch-none select-none items-center gap-1 overflow-hidden rounded-md border px-2 text-left text-xs font-medium text-white shadow-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--brand-primary)", pickFrom ? "cursor-copy" : canEdit ? "cursor-grab active:cursor-grabbing" : "cursor-pointer", task.status?.isDone && "opacity-60", (dragging || pickFrom === task.id) && "shadow-lg ring-2 ring-white/70")}
                        style={{ backgroundColor: color, borderColor: color }}
                      >
                        {blockedEarly && <TriangleAlert size={12} className="shrink-0" aria-hidden />}
                        <span className="truncate">{task.title}</span>
                      </button>
                      {canEdit && (
                        <>
                          <span onPointerDown={(e) => startDrag(e, task, "start")} className="absolute -left-1 top-0 h-full w-3 cursor-ew-resize touch-none [@media(pointer:coarse)]:w-5" aria-hidden="true" />
                          <span onPointerDown={(e) => startDrag(e, task, "end")} className="absolute -right-1 top-0 h-full w-3 cursor-ew-resize touch-none [@media(pointer:coarse)]:w-5" aria-hidden="true" />
                          <span
                            onPointerDown={(e) => startLink(e, task)}
                            title="Crear dependencia: haz clic aquí y luego en la tarea que debe esperar a esta, o arrástralo hasta ella"
                            className={cx("absolute -right-5 top-1/2 flex h-4 w-4 -translate-y-1/2 cursor-pointer touch-none items-center justify-center rounded-full border border-[hsl(var(--muted-foreground))] bg-[hsl(var(--card))] transition-opacity group-hover/bar:opacity-100 group-focus-within/bar:opacity-100 [@media(hover:none)]:opacity-100 [@media(pointer:coarse)]:-right-7 [@media(pointer:coarse)]:h-6 [@media(pointer:coarse)]:w-6", pickFrom === task.id ? "opacity-100 border-(--brand-primary) text-(--brand-primary)" : "opacity-0")}
                          >
                            <Link2 size={10} aria-hidden />
                          </span>
                        </>
                      )}
                      {dragging && <span className="pointer-events-none absolute -top-6 left-0 whitespace-nowrap rounded-md bg-[hsl(var(--foreground))] px-1.5 py-0.5 text-[11px] text-[hsl(var(--background))]">{dayText(span.start)} → {dayText(span.end)}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={Boolean(askRemove)} onOpenChange={(open) => { if (!open) setAskRemove(null); }}
        title="Quitar dependencia" tone="warning"
        description={askRemove ? `«${tasks.find((t) => t.id === askRemove.blockedId)?.title ?? "La tarea"}» dejará de esperar a «${tasks.find((t) => t.id === askRemove.blockerId)?.title ?? "la otra"}». No se mueve ninguna fecha.` : ""}
        confirmLabel="Quitar"
        onConfirm={() => { links.remove.mutate({ blockedId: askRemove.blockedId, depId: askRemove.id }); setAskRemove(null); }}
      />
    </div>
  );
}
