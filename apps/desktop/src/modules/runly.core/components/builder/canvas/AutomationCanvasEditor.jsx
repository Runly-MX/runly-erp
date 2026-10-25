// Canvas editor of an automation (n8n-style): blocks on a pannable, zoomable
// canvas joined by arrows; click a block to edit it in the inspector, drag a block
// by its grip to reorder, drag blocks from the palette onto a "+" slot, or use the
// "+" menus. It edits the same definition object as the form view. Spec
// docs/superpowers/specs/2026-10-25-automation-canvas-and-webhooks-design.md.
//
// Layout: canvas + docked inspector (>= 1024 px); below that the inspector opens
// as a side/bottom sheet. Left-to-right on wide canvases, top-to-bottom on narrow
// ones (< 640 px) so phones scroll the way they read.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, useIsMobile } from "@runly/ui";
import { CalendarClock, Clock, Filter, Globe, Maximize, Minus, MousePointerClick, Plus, Radio, ShieldCheck, Webhook, Zap } from "lucide-react";
import { toast } from "sonner";
import { conditionsOf, isApprovalStep, isDelayStep, isHttpStep, isPauseStep, stepsOf } from "@runly/module-compiler/browser";
import { describeCondition, describeStep, describeTrigger, insertStep, moveStep, removeStep, slotOptions, stepIssues, stepKindLabel, triggerKindLabel } from "../../../lib/flowModel";
import { dropIndex, layoutNodes, nearestSlot, toCanvas } from "../../../lib/canvasLayout";
import { ownerLabel } from "../AutomationSteps";
import { InspectorBody, InspectorHeader } from "../flow/FlowInspector";
import { AddGhost, CanvasEdges, CanvasNode, EdgePlus } from "./CanvasParts";
import { CanvasPalette } from "./CanvasPalette";
import { useCanvasView } from "./useCanvasView";

const DOCK_WIDTH = 1024;
const NARROW_CANVAS = 640;
const INSPECTOR_WIDTH = 384;
const TRIGGER_ICON = { record: MousePointerClick, event: Radio, schedule: CalendarClock, webhook: Webhook };
const cx = (...parts) => parts.filter(Boolean).join(" ");

const stepIcon = (step) => (isDelayStep(step) ? Clock : isApprovalStep(step) ? ShieldCheck : isHttpStep(step) ? Globe : Zap);

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!query) return undefined;
    const onChange = (event) => setReduced(event.matches);
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

export function AutomationCanvasEditor({ automation, entities, events, allowedTriggers, fieldOptions, readOnly, onPatch, className }) {
  const steps = stepsOf(automation);
  const trigger = automation.trigger;
  const docked = !useIsMobile(DOCK_WIDTH);
  const reducedMotion = usePrefersReducedMotion();
  const showConditions = trigger.type !== "schedule" || Boolean(trigger.entity);
  const conditions = conditionsOf(trigger.when);
  const stepOffset = showConditions ? 2 : 1;
  const fieldLabel = useCallback((name) => fieldOptions.find((option) => option.value === name)?.label ?? name, [fieldOptions]);

  const [selectedId, setSelectedId] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [orientation, setOrientation] = useState("horizontal");
  const [reorder, setReorder] = useState(null); // { index, offset, target, valid }
  const [dragKind, setDragKind] = useState(null); // palette drag: { kind, slot }

  // ---- nodes and layout
  const nodes = useMemo(() => {
    const triggerText = describeTrigger(trigger, { entities, events });
    const list = [{ id: "trigger", Icon: TRIGGER_ICON[trigger.type] ?? MousePointerClick, tone: "brand", kind: triggerKindLabel(trigger), title: triggerText.title, detail: triggerText.detail }];
    if (showConditions) {
      list.push({ id: "conditions", Icon: Filter, tone: "neutral", kind: "Condición", title: conditions.length ? "Solo si..." : "Siempre", detail: conditions.length ? conditions.map((condition) => describeCondition(condition, fieldLabel)).join(" y ") : "Sin condiciones: corre cada vez" });
    }
    steps.forEach((step, index) => {
      const { title, detail } = describeStep(step, ownerLabel);
      list.push({ id: `step-${index}`, Icon: stepIcon(step), tone: isPauseStep(step) ? "amber" : "neutral", kind: stepKindLabel(step), title, detail, issues: stepIssues(step), stepIndex: index });
    });
    return list;
  }, [trigger, entities, events, steps, showConditions, conditions, fieldLabel]);
  const layout = useMemo(() => layoutNodes(nodes, orientation), [nodes, orientation]);
  const edges = useMemo(() => layout.edges.map((edge) => {
    const fromStep = layout.nodes.find((node) => node.id === edge.from)?.stepIndex;
    return { ...edge, background: fromStep !== undefined && steps.slice(0, fromStep + 1).some(isPauseStep) };
  }), [layout, steps]);
  const tailBackground = steps.some(isPauseStep);
  const addGhost = layout.add ? { ...layout.add, edge: layout.add.edge } : null;

  const { view, animate, viewportRef, fit, zoomBy, reveal, bind } = useCanvasView({ bounds: layout.bounds, fitKey: `${orientation}:${nodes.length}` });

  useEffect(() => {
    const element = viewportRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => setOrientation(element.clientWidth < NARROW_CANVAS ? "vertical" : "horizontal"));
    observer.observe(element);
    return () => observer.disconnect();
  }, [viewportRef]);

  // Insertion slots in canvas units: before step i (an edge middle) or at the end (the add ghost).
  const slots = useMemo(() => {
    const list = steps.map((_, index) => {
      const edge = layout.edges[stepOffset + index - 1];
      return { index, point: edge ? edge.mid : { x: 0, y: 0 } };
    });
    list.push({ index: steps.length, point: addGhost ? { x: addGhost.x + addGhost.width / 2, y: addGhost.y + addGhost.height / 2 } : { x: 0, y: 0 } });
    return list;
  }, [steps, layout, stepOffset, addGhost]);

  // ---- selection
  const selected = useMemo(() => {
    if (selectedId === "trigger") return { id: "trigger", kind: "trigger" };
    if (selectedId === "conditions" && showConditions) return { id: "conditions", kind: "conditions" };
    const match = /^step-(\d+)$/.exec(selectedId ?? "");
    if (match && Number(match[1]) < steps.length) return { id: selectedId, kind: "step", index: Number(match[1]) };
    return null;
  }, [selectedId, steps.length, showConditions]);
  const current = selected;

  // ---- operations
  const patchSteps = (next, nextSelection) => {
    onPatch({ steps: next });
    if (nextSelection !== undefined) setSelectedId(nextSelection);
  };
  const insert = (index, kind) => {
    const result = insertStep(steps, index, kind);
    if (!result.ok) { toast.info(result.reason); return; }
    patchSteps(result.steps, `step-${index}`);
  };
  const move = (from, to) => {
    const next = moveStep(steps, from, to);
    if (next) patchSteps(next, `step-${to}`);
  };
  const remove = (index) => {
    const previous = steps;
    patchSteps(removeStep(steps, index), null);
    toast("Bloque quitado", { action: { label: "Deshacer", onClick: () => onPatch({ steps: previous }) } });
  };
  const selectedStep = current?.kind === "step" ? current.index : null;
  const addFromPalette = (kind) => insert(selectedStep === null ? steps.length : selectedStep + 1, kind);

  // ---- reorder by dragging a grip
  const handleFor = (index) => ({
    style: { touchAction: "none" },
    onPointerDown: (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      const rect = viewportRef.current.getBoundingClientRect();
      reorderRef.current = { index, startX: event.clientX, startY: event.clientY, rect };
      setReorder({ index, offset: { x: 0, y: 0 }, target: index, valid: false });
    },
    onPointerMove: (event) => {
      const drag = reorderRef.current;
      if (!drag) return;
      const horizontal = orientation === "horizontal";
      const offset = { x: (event.clientX - drag.startX) / view.k, y: (event.clientY - drag.startY) / view.k };
      const pointer = toCanvas(view, { x: event.clientX - drag.rect.left, y: event.clientY - drag.rect.top });
      const centres = steps.map((_, i) => {
        const node = layout.nodes[stepOffset + i];
        return horizontal ? node.x + node.width / 2 : node.y + node.height / 2;
      });
      const target = dropIndex(centres, drag.index, horizontal ? pointer.x : pointer.y);
      setReorder({ index: drag.index, offset, target, valid: target !== drag.index && moveStep(steps, drag.index, target) !== null });
    },
    onPointerUp: () => finishReorder(true),
    onPointerCancel: () => finishReorder(false),
  });
  const reorderRef = useRef(null);
  const finishReorder = (commit) => {
    const drag = reorderRef.current;
    reorderRef.current = null;
    const state = reorder;
    setReorder(null);
    if (commit && drag && state?.valid) move(drag.index, state.target);
  };

  // ---- palette drag: which slot is closest to the pointer
  const slotAtClient = (point) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect || point.x < rect.left || point.x > rect.right || point.y < rect.top || point.y > rect.bottom) return null;
    return nearestSlot(slots, toCanvas(view, { x: point.x - rect.left, y: point.y - rect.top }), 220 / view.k);
  };
  const onPaletteOver = (kind, point) => setDragKind(kind ? { kind, slot: slotAtClient(point)?.index ?? null } : null);
  const onPaletteDrop = (kind, point) => {
    const hit = slotAtClient(point);
    const rect = viewportRef.current?.getBoundingClientRect();
    const inside = rect && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
    if (hit) insert(hit.index, kind);
    else if (inside) insert(steps.length, kind);
  };

  // ---- keyboard on blocks
  const onNodeKey = (event, stepIndex) => {
    const buttons = [...(viewportRef.current?.querySelectorAll("[data-canvas-node]") ?? [])];
    const at = buttons.indexOf(event.currentTarget);
    if (event.altKey && stepIndex !== undefined && !readOnly && event.key.startsWith("Arrow")) {
      event.preventDefault();
      move(stepIndex, stepIndex + (event.key === "ArrowUp" || event.key === "ArrowLeft" ? -1 : 1));
      return;
    }
    if (event.key === "ArrowRight" || event.key === "ArrowDown") { event.preventDefault(); buttons[at + 1]?.focus(); }
    else if (event.key === "ArrowLeft" || event.key === "ArrowUp") { event.preventDefault(); buttons[at - 1]?.focus(); }
    else if ((event.key === "Delete" || event.key === "Backspace") && stepIndex !== undefined && !readOnly) { event.preventDefault(); remove(stepIndex); }
  };

  // Select a block; bring it into view (and make room for the inspector about to dock).
  const select = (node) => {
    reveal(node, docked && !current ? INSPECTOR_WIDTH : 0);
    setSelectedId(node.id);
  };

  const endSlot = steps.length;
  const options = (index) => slotOptions(steps, index);
  const endOptions = options(endSlot);
  const inspector = current ? (
    <>
      <InspectorHeader
        node={current} stepCount={steps.length} readOnly={readOnly}
        title={current.kind === "trigger" ? "Cuándo empieza" : current.kind === "conditions" ? "Solo si" : describeStep(steps[current.index], ownerLabel).title}
        subtitle={current.kind === "step" ? `Bloque ${current.index + 1} de ${steps.length}` : null}
        onMove={(delta) => move(current.index, current.index + delta)}
        onRemove={() => remove(current.index)}
        onClose={() => setSelectedId(null)}
      />
      <div className="mt-4">
        <InspectorBody
          node={current} automation={automation} steps={steps} entities={entities} events={events} allowedTriggers={allowedTriggers}
          fieldOptions={fieldOptions} readOnly={readOnly} onPatch={onPatch}
          onStep={(index, next) => onPatch({ steps: steps.map((step, i) => (i === index ? next : step)) })}
        />
      </div>
    </>
  ) : null;

  const markerSlot = reorder ? (reorder.target <= reorder.index ? reorder.target : reorder.target + 1) : dragKind?.slot ?? null;
  const markerValid = reorder ? reorder.valid : true;
  const marker = markerSlot !== null && markerSlot !== undefined ? slots.find((slot) => slot.index === markerSlot)?.point : null;

  return (
    <div className={cx("flex min-h-0 overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]", className)}>
      <section
        ref={viewportRef}
        role="group"
        aria-label="Lienzo de la automatización"
        onScroll={(event) => { event.currentTarget.scrollLeft = 0; event.currentTarget.scrollTop = 0; }}
        className="relative min-w-0 flex-1 touch-none select-none overflow-hidden overscroll-contain bg-[hsl(var(--muted))]/30"
        style={{
          backgroundImage: "radial-gradient(circle, hsl(var(--muted-foreground) / 0.28) 1px, transparent 1.5px)",
          backgroundSize: `${24 * view.k}px ${24 * view.k}px`,
          backgroundPosition: `${view.x}px ${view.y}px`,
        }}
        {...bind}
      >
        <div
          className={cx("absolute left-0 top-0 origin-top-left", animate && !reducedMotion && "transition-transform duration-200 ease-out")}
          style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.k})` }}
        >
          <CanvasEdges edges={edges} orientation={orientation} reducedMotion={reducedMotion} />
          {edges.map((edge) => (edge.toIndex >= stepOffset ? (
            <EdgePlus
              key={edge.id} edge={edge} orientation={orientation} readOnly={readOnly}
              options={options(edge.toIndex - stepOffset)} onPick={(kind) => insert(edge.toIndex - stepOffset, kind)}
              active={markerSlot === edge.toIndex - stepOffset && dragKind !== null}
            />
          ) : null))}
          {layout.nodes.map((node, index) => {
            const source = nodes[index];
            const isStep = node.stepIndex !== undefined;
            const dragging = reorder?.index === node.stepIndex && isStep;
            return (
              <CanvasNode
                key={node.id}
                node={{ ...node, ...source }}
                selected={current?.id === node.id}
                dragging={dragging}
                offset={dragging ? reorder.offset : null}
                first={index === 0}
                last={index === layout.nodes.length - 1}
                orientation={orientation}
                handle={isStep && !readOnly && steps.length > 1 ? handleFor(node.stepIndex) : null}
                onSelect={() => select(node)}
                onKeyDown={(event) => onNodeKey(event, node.stepIndex)}
              />
            );
          })}
          <AddGhost
            add={addGhost && { ...addGhost, edge: { start: addGhost.edge.start, end: addGhost.edge.end } }} orientation={orientation} readOnly={readOnly}
            options={endOptions} onPick={(kind) => insert(endSlot, kind)} full={endOptions.every((option) => option.disabled)}
            active={markerSlot === endSlot && dragKind !== null}
          />
          {marker && (
            <span
              aria-hidden="true"
              className={cx("pointer-events-none absolute z-40 rounded-full", markerValid ? "bg-(--brand-primary)" : "bg-red-500")}
              style={orientation === "horizontal"
                ? { left: marker.x - 2, top: marker.y - 30, width: 4, height: 60 }
                : { left: marker.x - 30, top: marker.y - 2, width: 60, height: 4 }}
            />
          )}
        </div>

        {!readOnly && (
          <CanvasPalette
            open={paletteOpen} onToggle={() => setPaletteOpen((open) => !open)} options={endOptions}
            onAdd={addFromPalette} onDragOver={onPaletteOver} onDrop={onPaletteDrop}
          />
        )}

        <div data-no-pan className="absolute bottom-3 left-3 z-30 flex items-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-sm">
          <button type="button" aria-label="Alejar" title="Alejar" onClick={() => zoomBy(1 / 1.25)} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-l-md hover:bg-[hsl(var(--muted))] [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"><Minus className="h-4 w-4" /></button>
          <span className="w-12 text-center text-xs tabular-nums text-[hsl(var(--muted-foreground))]" aria-live="polite">{Math.round(view.k * 100)}%</span>
          <button type="button" aria-label="Acercar" title="Acercar" onClick={() => zoomBy(1.25)} className="flex h-8 w-8 cursor-pointer items-center justify-center hover:bg-[hsl(var(--muted))] [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"><Plus className="h-4 w-4" /></button>
          <button type="button" aria-label="Ajustar a la pantalla" title="Ajustar a la pantalla" onClick={() => fit(true)} className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-r-md border-l border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"><Maximize className="h-4 w-4" /></button>
        </div>
        <p className="pointer-events-none absolute bottom-3 right-3 z-20 hidden max-w-[16rem] text-right text-xs text-[hsl(var(--muted-foreground))] sm:block">
          <span className="[@media(hover:none)]:hidden">Arrastra el fondo para mover · Ctrl + rueda para acercar</span>
          <span className="hidden [@media(hover:none)]:inline">Arrastra el fondo para mover · pellizca para acercar</span>
        </p>
      </section>

      {docked ? (current && (
        <aside aria-label="Editar bloque" className="w-[24rem] shrink-0 overflow-y-auto border-l border-[hsl(var(--border))] p-4">
          {inspector}
        </aside>
      )) : (
        <Sheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
            <SheetHeader className="sr-only">
              <SheetTitle>Editar bloque</SheetTitle>
              <SheetDescription>Cambia la configuración del bloque seleccionado.</SheetDescription>
            </SheetHeader>
            {inspector}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
