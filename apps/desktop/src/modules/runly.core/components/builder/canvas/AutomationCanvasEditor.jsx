// Canvas editor of an automation (n8n-style): blocks on a pannable, zoomable
// canvas joined by arrows; click a block to edit it in the inspector, drag a block
// anywhere to arrange the canvas, drag its grip to change the order in the flow,
// drag blocks from the palette onto a "+" slot, or use the "+" menus. It edits the
// same definition object as the form view. Spec
// docs/superpowers/specs/2026-10-25-automation-canvas-and-webhooks-design.md.
//
// Layout: canvas + docked, resizable inspector (>= 1024 px); below that the
// inspector opens as a side/bottom sheet. Presets: horizontal, vertical (the
// default follows the canvas width) and free positions saved with the automation.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Popover, PopoverContent, PopoverTrigger, Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, useIsMobile } from "@runly/ui";
import { ArrowDownUp, ArrowRightLeft, CalendarClock, Clock, Filter, GitBranch, Globe, LayoutDashboard, Maximize, Minus, MousePointerClick, Plus, Radio, ShieldCheck, Webhook, Wand2, Zap } from "lucide-react";
import { toast } from "sonner";
import { conditionsOf, isApprovalStep, isBranchStep, isDelayStep, isHttpStep, isPauseStep, stepsOf } from "@runly/module-compiler/browser";
import {
  describeCondition, describeStep, describeTrigger, flowPlan, insertStep, moveStep, positionsFromUi, removeStep, slotOptions, stepIssues, stepKindLabel, triggerKindLabel,
  uiAfterInsert, uiAfterMove, uiAfterRemove, uiArranged, uiFit, uiWithLayout, uiWithPosition,
} from "../../../lib/flowModel";
import { NODE, dropIndex, layoutNodes, nearestSlot, snap, toCanvas } from "../../../lib/canvasLayout";
import { ownerLabel } from "../AutomationSteps";
import { InspectorBody, InspectorHeader } from "../flow/FlowInspector";
import { AddGhost, CanvasEdges, CanvasNode, EdgeLabels, EdgePlus } from "./CanvasParts";
import { CanvasPalette } from "./CanvasPalette";
import { useCanvasView } from "./useCanvasView";

const DOCK_WIDTH = 1024;
const NARROW_CANVAS = 640;
const WIDTH_KEY = "runly.automations.inspectorWidth";
const DEFAULT_INSPECTOR = 400;
const MIN_INSPECTOR = 340;
const WIDE_INSPECTOR = 680;
const MOVE_THRESHOLD = 5;
const TRIGGER_ICON = { record: MousePointerClick, event: Radio, schedule: CalendarClock, webhook: Webhook };
const cx = (...parts) => parts.filter(Boolean).join(" ");
const stepIcon = (step) => (isBranchStep(step) ? GitBranch : isDelayStep(step) ? Clock : isApprovalStep(step) ? ShieldCheck : isHttpStep(step) ? Globe : Zap);
// An insertion slot is a position plus the path of a condition it belongs to.
const slotKey = (slot) => (slot ? `${slot.index}:${slot.lane ? `${slot.lane.branch}${slot.lane.which}` : ""}` : "");

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

// A per-viewer convenience only: the page works without storage.
function readWidth() {
  try {
    const value = Number(window.localStorage.getItem(WIDTH_KEY));
    return Number.isFinite(value) && value >= MIN_INSPECTOR ? value : DEFAULT_INSPECTOR;
  } catch { return DEFAULT_INSPECTOR; }
}
function rememberWidth(value) {
  try { window.localStorage.setItem(WIDTH_KEY, String(Math.round(value))); } catch { /* storage blocked */ }
}

// Last run -> a status per block id.
function runStatuses(run) {
  if (!run) return {};
  const map = { trigger: "success", conditions: "success" };
  for (const entry of run.steps ?? []) {
    map[`step-${entry.index}`] = entry.skipped ? "skipped" : entry.ok ? (entry.waiting ? "waiting" : "success") : "failed";
  }
  return map;
}

export function AutomationCanvasEditor({ automation, entities, events, allowedTriggers, fieldOptions, readOnly, onPatch, className, runOverlay = null }) {
  const steps = stepsOf(automation);
  const trigger = automation.trigger;
  const ui = automation.ui;
  const docked = !useIsMobile(DOCK_WIDTH);
  const reducedMotion = usePrefersReducedMotion();
  const showConditions = trigger.type !== "schedule" || Boolean(trigger.entity);
  const conditions = conditionsOf(trigger.when);
  const stepOffset = showConditions ? 2 : 1;
  const fieldLabel = useCallback((name) => fieldOptions.find((option) => option.value === name)?.label ?? name, [fieldOptions]);

  const [selectedId, setSelectedId] = useState(null);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [responsive, setResponsive] = useState("horizontal");
  const [refit, setRefit] = useState(0);
  const [layoutMenu, setLayoutMenu] = useState(false);
  const [reorder, setReorder] = useState(null); // grip drag: { index, offset, target, valid }
  const [liveMove, setLiveMove] = useState(null); // block drag: { id, x, y }
  const [dragKind, setDragKind] = useState(null); // palette drag: { kind, slot }
  const [inspectorWidth, setInspectorWidth] = useState(readWidth);
  const reorderRef = useRef(null);
  const moveRef = useRef(null);
  const suppressClick = useRef(false);
  const rootRef = useRef(null);

  // ---- nodes and layout
  const gridOrientation = ui?.layout === "horizontal" || ui?.layout === "vertical" ? ui.layout : responsive;
  const plan = useMemo(() => flowPlan(steps), [steps]);
  const nodes = useMemo(() => {
    const triggerText = describeTrigger(trigger, { entities, events });
    const list = [{ id: "trigger", col: 0, row: 0, Icon: TRIGGER_ICON[trigger.type] ?? MousePointerClick, tone: "brand", kind: triggerKindLabel(trigger), title: triggerText.title, detail: triggerText.detail }];
    if (showConditions) {
      list.push({ id: "conditions", col: 1, row: 0, Icon: Filter, tone: "neutral", kind: "Condición", title: conditions.length ? "Solo si..." : "Siempre", detail: conditions.length ? conditions.map((condition) => describeCondition(condition, fieldLabel)).join(" y ") : "Sin condiciones: corre cada vez" });
    }
    steps.forEach((step, index) => {
      const { title, detail } = describeStep(step, ownerLabel, fieldLabel);
      const cell = plan.cells[index] ?? { col: index, row: 0 };
      list.push({ id: `step-${index}`, col: stepOffset + cell.col, row: cell.row, Icon: stepIcon(step), tone: isPauseStep(step) ? "amber" : "neutral", kind: stepKindLabel(step), title, detail, issues: stepIssues(step), stepIndex: index });
    });
    return list;
  }, [trigger, entities, events, steps, showConditions, conditions, fieldLabel, plan, stepOffset]);
  const positions = useMemo(() => ({ ...positionsFromUi(ui), ...(liveMove ? { [liveMove.id]: { x: liveMove.x, y: liveMove.y } } : {}) }), [ui, liveMove]);
  const links = useMemo(() => {
    const lastFixed = showConditions ? "conditions" : "trigger";
    const list = showConditions ? [{ from: "trigger", to: "conditions", slot: null }] : [];
    for (const link of plan.links) list.push({ ...link, from: link.from < 0 ? lastFixed : `step-${link.from}`, to: `step-${link.to}` });
    return list;
  }, [plan, showConditions]);
  const layout = useMemo(() => layoutNodes(nodes, gridOrientation, positions, links), [nodes, gridOrientation, positions, links]);
  const edges = useMemo(() => layout.edges.map((edge) => {
    const fromStep = layout.nodes.find((node) => node.id === edge.from)?.stepIndex;
    return { ...edge, background: fromStep !== undefined && steps.slice(0, fromStep + 1).some(isPauseStep) };
  }), [layout, steps]);
  const statuses = useMemo(() => runStatuses(runOverlay), [runOverlay]);

  const { view, animate, viewportRef, fit, zoomBy, reveal, bind } = useCanvasView({ bounds: layout.bounds, fitKey: `${gridOrientation}:${nodes.length}:${refit}` });

  useEffect(() => {
    const element = viewportRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => setResponsive(element.clientWidth < NARROW_CANVAS ? "vertical" : "horizontal"));
    observer.observe(element);
    return () => observer.disconnect();
  }, [viewportRef]);

  // Insertion slots in canvas units: an arrow's middle, or the closing add slot.
  const endSlot = plan.tails[plan.tails.length - 1]?.slot ?? { index: steps.length, lane: null };
  const slots = useMemo(() => {
    const list = layout.edges.filter((edge) => edge.slot).map((edge) => ({ ...edge.slot, key: slotKey(edge.slot), point: edge.mid }));
    list.push({ ...endSlot, key: slotKey(endSlot), point: layout.add ? { x: layout.add.x + layout.add.width / 2, y: layout.add.y + layout.add.height / 2 } : { x: 0, y: 0 } });
    return list;
  }, [layout, endSlot]);

  // ---- selection
  const selected = useMemo(() => {
    if (selectedId === "trigger") return { id: "trigger", kind: "trigger" };
    if (selectedId === "conditions" && showConditions) return { id: "conditions", kind: "conditions" };
    const match = /^step-(\d+)$/.exec(selectedId ?? "");
    if (match && Number(match[1]) < steps.length) return { id: selectedId, kind: "step", index: Number(match[1]) };
    return null;
  }, [selectedId, steps.length, showConditions]);
  const current = selected;

  // Select a block, bring it into view and make room for the inspector about to dock.
  const select = (node) => {
    reveal(node, docked && !current ? inspectorWidth : 0);
    setSelectedId(node.id);
  };

  // ---- operations on the flow (the saved positions follow the steps)
  const apply = (nextSteps, nextUi, nextSelection) => {
    onPatch({ steps: nextSteps, ui: uiFit(nextUi, nextSteps.length) });
    if (nextSelection !== undefined) setSelectedId(nextSelection);
  };
  const insert = (slot, kind) => {
    const result = insertStep(steps, slot.index, kind, slot.lane);
    if (!result.ok) { toast.info(result.reason); return; }
    const added = result.steps.length - steps.length;
    let nextUi = uiAfterInsert(ui, slot.index, added);
    // In a free layout the new block starts just below the one before it.
    if (nextUi?.layout === "free") {
      const before = layout.nodes[stepOffset + slot.index - 1] ?? layout.nodes[layout.nodes.length - 1];
      nextUi = uiWithPosition(nextUi, `step-${slot.index}`, { x: snap(before.x + 24), y: snap(before.y + NODE.height + 40) }, result.steps.length);
    }
    apply(result.steps, nextUi, `step-${slot.index}`);
  };
  const move = (from, to) => {
    const next = moveStep(steps, from, to);
    if (next) apply(next, uiAfterMove(ui, from, to), `step-${to}`);
  };
  const remove = (index) => {
    const previous = { steps, ui };
    apply(removeStep(steps, index), uiAfterRemove(ui, index), null);
    toast("Bloque quitado", { action: { label: "Deshacer", onClick: () => onPatch(previous) } });
  };
  const selectedStep = current?.kind === "step" ? current.index : null;
  // From the palette a block goes right after the selected one, on its path.
  const addFromPalette = (kind) => insert(selectedStep === null ? endSlot : (plan.links.find((link) => link.from === selectedStep)?.slot ?? endSlot), kind);

  // ---- presets
  const setPreset = (preset) => {
    onPatch({ ui: preset === "arrange" ? uiArranged(ui) : uiWithLayout(preset) });
    setRefit((value) => value + 1);
    setLayoutMenu(false);
  };

  // ---- drag a block anywhere (free layout)
  const finishMove = (commit) => {
    const drag = moveRef.current;
    moveRef.current = null;
    const live = liveMove;
    setLiveMove(null);
    if (!drag?.moved) return;
    suppressClick.current = true;
    window.setTimeout(() => { suppressClick.current = false; }, 60);
    if (!commit || !live) return;
    // The first manual move freezes every block where it is, so nothing jumps.
    let nextUi = ui?.layout === "free" ? ui : undefined;
    if (!nextUi) layout.nodes.forEach((node) => { nextUi = uiWithPosition(nextUi, node.id, { x: node.x, y: node.y }, steps.length); });
    onPatch({ ui: uiWithPosition(nextUi, live.id, { x: snap(live.x), y: snap(live.y) }, steps.length) });
  };
  const moveFor = (node) => (readOnly ? undefined : {
    style: { touchAction: "none" },
    onPointerDown: (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      moveRef.current = { id: node.id, startX: event.clientX, startY: event.clientY, origin: { x: node.x, y: node.y }, moved: false };
    },
    onPointerMove: (event) => {
      const drag = moveRef.current;
      if (!drag) return;
      const dx = event.clientX - drag.startX;
      const dy = event.clientY - drag.startY;
      if (!drag.moved) {
        if (Math.hypot(dx, dy) < MOVE_THRESHOLD) return;
        drag.moved = true;
        event.currentTarget.setPointerCapture?.(event.pointerId);
      }
      setLiveMove({ id: drag.id, x: drag.origin.x + dx / view.k, y: drag.origin.y + dy / view.k });
    },
    onPointerUp: () => finishMove(true),
    onPointerCancel: () => finishMove(false),
  });

  // ---- reorder in the flow by dragging a grip
  const finishReorder = (commit) => {
    const drag = reorderRef.current;
    reorderRef.current = null;
    const state = reorder;
    setReorder(null);
    if (commit && drag && state?.valid) move(drag.index, state.target);
  };
  const handleFor = (index) => ({
    style: { touchAction: "none" },
    onPointerDown: (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      event.stopPropagation();
      event.currentTarget.setPointerCapture?.(event.pointerId);
      reorderRef.current = { index, startX: event.clientX, startY: event.clientY, rect: viewportRef.current.getBoundingClientRect() };
      setReorder({ index, offset: { x: 0, y: 0 }, target: index, valid: false });
    },
    onPointerMove: (event) => {
      const drag = reorderRef.current;
      if (!drag) return;
      const horizontal = gridOrientation === "horizontal";
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

  // ---- palette drag: which slot is closest to the pointer
  const slotAtClient = (point) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    if (!rect || point.x < rect.left || point.x > rect.right || point.y < rect.top || point.y > rect.bottom) return null;
    return nearestSlot(slots, toCanvas(view, { x: point.x - rect.left, y: point.y - rect.top }), 220 / view.k)?.slot ?? null;
  };
  const onPaletteOver = (kind, point) => setDragKind(kind ? { kind, slot: slotAtClient(point) } : null);
  const onPaletteDrop = (kind, point) => {
    const hit = slotAtClient(point);
    const rect = viewportRef.current?.getBoundingClientRect();
    const inside = rect && point.x >= rect.left && point.x <= rect.right && point.y >= rect.top && point.y <= rect.bottom;
    if (hit) insert(hit, kind);
    else if (inside) insert(endSlot, kind);
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

  // ---- resizable inspector
  const clampWidth = (value) => {
    const container = rootRef.current?.getBoundingClientRect().width ?? 1200;
    return Math.max(MIN_INSPECTOR, Math.min(value, 780, container - 320));
  };
  const resizeProps = {
    role: "separator",
    "aria-orientation": "vertical",
    "aria-label": "Cambiar el ancho del panel",
    "aria-valuenow": Math.round(inspectorWidth),
    "aria-valuemin": MIN_INSPECTOR,
    tabIndex: 0,
    onPointerDown: (event) => {
      event.currentTarget.setPointerCapture?.(event.pointerId);
      event.currentTarget.dataset.resizing = "true";
    },
    onPointerMove: (event) => {
      if (event.currentTarget.dataset.resizing !== "true") return;
      const right = rootRef.current.getBoundingClientRect().right;
      setInspectorWidth(clampWidth(right - event.clientX));
    },
    onPointerUp: (event) => { delete event.currentTarget.dataset.resizing; rememberWidth(inspectorWidth); },
    onPointerCancel: (event) => { delete event.currentTarget.dataset.resizing; },
    onKeyDown: (event) => {
      if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
      event.preventDefault();
      const next = clampWidth(inspectorWidth + (event.key === "ArrowLeft" ? 32 : -32));
      setInspectorWidth(next);
      rememberWidth(next);
    },
  };
  const expanded = inspectorWidth >= 600;
  const toggleExpanded = () => {
    const next = clampWidth(expanded ? DEFAULT_INSPECTOR : WIDE_INSPECTOR);
    setInspectorWidth(next);
    rememberWidth(next);
  };

  // ---- inspector content
  const options = (slot) => slotOptions(steps, slot.index, slot.lane);
  const endOptions = options(endSlot);
  const currentNode = current ? nodes.find((node) => node.id === current.id) : null;
  const inspector = current && currentNode ? (
    <>
      <InspectorHeader
        icon={currentNode.Icon} tone={currentNode.tone} kindLabel={currentNode.kind}
        node={current} stepCount={steps.length} readOnly={readOnly}
        title={current.kind === "trigger" ? currentNode.title : current.kind === "conditions" ? "Solo si..." : describeStep(steps[current.index], ownerLabel, fieldLabel).title}
        subtitle={current.kind === "step" ? `Bloque ${current.index + 1} de ${steps.length}` : null}
        expanded={expanded} onToggleExpand={docked ? toggleExpanded : undefined}
        onMove={(delta) => move(current.index, current.index + delta)}
        onRemove={() => remove(current.index)}
        onClose={() => setSelectedId(null)}
      />
      <div className="mt-5">
        <InspectorBody
          node={current} automation={automation} steps={steps} entities={entities} events={events} allowedTriggers={allowedTriggers}
          fieldOptions={fieldOptions} readOnly={readOnly} onPatch={onPatch}
          onStep={(index, next) => onPatch({ steps: steps.map((step, i) => (i === index ? next : step)) })}
        />
      </div>
    </>
  ) : null;

  const markerPoint = reorder
    ? slots.find((slot) => slot.index === (reorder.target <= reorder.index ? reorder.target : reorder.target + 1))?.point
    : dragKind?.slot ? slots.find((slot) => slot.key === slotKey(dragKind.slot))?.point : null;
  const markerValid = reorder ? reorder.valid : true;
  const marker = markerPoint ?? null;
  const activeKey = dragKind?.slot ? slotKey(dragKind.slot) : null;
  const horizontalFlow = gridOrientation === "horizontal";

  return (
    <div ref={rootRef} className={cx("flex min-h-0 overflow-hidden rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))]", className)}>
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
          <CanvasEdges edges={edges} reducedMotion={reducedMotion} />
          <EdgeLabels edges={edges} />
          {edges.map((edge) => (edge.slot ? (
            <EdgePlus
              key={edge.id} edge={edge} readOnly={readOnly}
              options={options(edge.slot)} onPick={(kind) => insert(edge.slot, kind)}
              active={activeKey !== null && activeKey === slotKey(edge.slot)}
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
                moving={liveMove?.id === node.id}
                offset={dragging ? reorder.offset : null}
                run={statuses[node.id]}
                move={moveFor(node)}
                handle={isStep && !readOnly && steps.length > 1 ? handleFor(node.stepIndex) : null}
                onSelect={() => { if (!suppressClick.current) select(node); }}
                onKeyDown={(event) => onNodeKey(event, node.stepIndex)}
              />
            );
          })}
          <AddGhost
            add={layout.add} readOnly={readOnly}
            options={endOptions} onPick={(kind) => insert(endSlot, kind)} full={endOptions.every((option) => option.disabled)}
            active={activeKey !== null && activeKey === slotKey(endSlot)}
          />
          {marker && (
            <span
              aria-hidden="true"
              className={cx("pointer-events-none absolute z-40 rounded-full", markerValid ? "bg-(--brand-primary)" : "bg-red-500")}
              style={horizontalFlow ? { left: marker.x - 2, top: marker.y - 30, width: 4, height: 60 } : { left: marker.x - 30, top: marker.y - 2, width: 60, height: 4 }}
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
          <button type="button" aria-label="Ajustar a la pantalla" title="Ajustar a la pantalla" onClick={() => fit(true)} className="flex h-8 w-8 cursor-pointer items-center justify-center border-l border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"><Maximize className="h-4 w-4" /></button>
          {!readOnly && (
            <Popover open={layoutMenu} onOpenChange={setLayoutMenu}>
              <PopoverTrigger asChild>
                <button type="button" aria-label="Disposición de los bloques" title="Disposición de los bloques" className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-r-md border-l border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] data-[state=open]:bg-(--brand-primary)/15 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"><LayoutDashboard className="h-4 w-4" /></button>
              </PopoverTrigger>
              <PopoverContent align="start" side="top" className="w-72 p-1.5">
                <p className="px-2 py-1 text-xs text-[hsl(var(--muted-foreground))]">Arrastra cualquier bloque para acomodarlo a tu gusto, o elige una disposición.</p>
                <ul className="space-y-0.5">
                  {[
                    ["horizontal", ArrowRightLeft, "Horizontal", "De izquierda a derecha"],
                    ["vertical", ArrowDownUp, "Vertical", "De arriba hacia abajo"],
                    ["arrange", Wand2, "Ordenar", "Vuelve a alinear los bloques"],
                  ].map(([value, Icon, label, hint]) => (
                    <li key={value}>
                      <button type="button" onClick={() => setPreset(value)} className="flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-2 text-left hover:bg-[hsl(var(--muted))] [@media(pointer:coarse)]:min-h-11">
                        <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                        <span><span className="block text-sm font-medium leading-tight">{label}</span><span className="block text-xs text-[hsl(var(--muted-foreground))]">{hint}</span></span>
                      </button>
                    </li>
                  ))}
                </ul>
              </PopoverContent>
            </Popover>
          )}
        </div>
        <p className="pointer-events-none absolute bottom-3 right-3 z-20 hidden max-w-[16rem] text-right text-xs text-[hsl(var(--muted-foreground))] sm:block">
          <span className="[@media(hover:none)]:hidden">Arrastra el fondo para mover · Ctrl + rueda para acercar</span>
          <span className="hidden [@media(hover:none)]:inline">Arrastra el fondo para mover · pellizca para acercar</span>
        </p>
      </section>

      {docked ? (current && (
        <aside aria-label="Editar bloque" style={{ width: inspectorWidth }} className="relative shrink-0 overflow-y-auto border-l border-[hsl(var(--border))] p-5">
          <div
            {...resizeProps}
            className="absolute -left-1.5 top-0 z-20 h-full w-3 cursor-col-resize touch-none select-none after:absolute after:inset-y-0 after:left-1/2 after:w-0.5 after:-translate-x-1/2 after:bg-transparent hover:after:bg-(--brand-primary)/50 focus-visible:after:bg-(--brand-primary)"
          />
          {inspector}
        </aside>
      )) : (
        <Sheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto p-5 sm:max-w-lg">
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
