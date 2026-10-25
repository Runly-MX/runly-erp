// Visual editor of an automation ("Flujo"): the automation as one thread from the
// trigger to its last step. Edits the same definition object as the form view,
// so both views are interchangeable. Spec
// docs/superpowers/specs/2026-10-25-automation-visual-editor-design.md.
//
// Layout: thread on the left; on screens >= 1024px the inspector is docked on the
// right, below that it opens as a side sheet (a bottom sheet on phones).
import { Fragment, useCallback, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SwitchField, useIsMobile } from "@runly/ui";
import { Clock, Filter, Globe, MousePointerClick, ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";
import { conditionsOf, isApprovalStep, isDelayStep, isHttpStep, isPauseStep, stepsOf } from "@runly/module-compiler/browser";
import { backgroundFrom, describeCondition, describeStep, describeTrigger, insertStep, moveStep, removeStep, slotOptions, stepIssues } from "../../../lib/flowModel";
import { ownerLabel } from "../AutomationSteps";
import { FlowEnd, FlowNode, FlowSlot } from "./FlowNode";
import { InspectorBody, InspectorHeader } from "./FlowInspector";
import { useFlowDrag } from "./useFlowDrag";

const DOCK_WIDTH = 1024;
const stepIcon = (step) => (isDelayStep(step) ? Clock : isApprovalStep(step) ? ShieldCheck : isHttpStep(step) ? Globe : Zap);

export function AutomationFlow({ automation, entities, events, allowedTriggers, fieldOptions, readOnly, onPatch }) {
  const steps = stepsOf(automation);
  const trigger = automation.trigger;
  const docked = !useIsMobile(DOCK_WIDTH);
  const [selectedId, setSelectedId] = useState(docked ? "trigger" : null);
  const itemRefs = useRef([]);
  const listRef = useRef(null);

  const showConditions = trigger.type !== "schedule" || Boolean(trigger.entity);
  const conditions = conditionsOf(trigger.when);
  const fieldLabel = useCallback((name) => fieldOptions.find((option) => option.value === name)?.label ?? name, [fieldOptions]);
  const firstBackground = backgroundFrom(steps); // index of the first step that runs in the background, or -1

  const selected = useMemo(() => {
    if (selectedId === "trigger") return { id: "trigger", kind: "trigger" };
    if (selectedId === "conditions" && showConditions) return { id: "conditions", kind: "conditions" };
    const match = /^step-(\d+)$/.exec(selectedId ?? "");
    if (match && Number(match[1]) < steps.length) return { id: selectedId, kind: "step", index: Number(match[1]) };
    return null;
  }, [selectedId, steps.length, showConditions]);
  // On wide screens the inspector is never empty.
  const current = selected ?? (docked ? { id: "trigger", kind: "trigger" } : null);

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
    patchSteps(removeStep(steps, index), docked ? "trigger" : null);
    toast("Paso quitado", { action: { label: "Deshacer", onClick: () => onPatch({ steps: previous }) } });
  };

  const { drag, handleProps } = useFlowDrag({
    itemRefs,
    count: steps.length,
    canDrop: (from, to) => moveStep(steps, from, to) !== null,
    onDrop: move,
  });

  const onNodeKey = (event, index) => {
    const nodes = [...(listRef.current?.querySelectorAll("[data-flow-node]") ?? [])];
    const at = nodes.indexOf(event.currentTarget);
    if (event.altKey && index !== undefined && !readOnly && (event.key === "ArrowUp" || event.key === "ArrowDown")) {
      event.preventDefault();
      move(index, index + (event.key === "ArrowUp" ? -1 : 1));
      return;
    }
    if (event.key === "ArrowDown") { event.preventDefault(); nodes[at + 1]?.focus(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); nodes[at - 1]?.focus(); }
    else if ((event.key === "Delete" || event.key === "Backspace") && index !== undefined && !readOnly) { event.preventDefault(); remove(index); }
  };

  const triggerText = describeTrigger(trigger, { entities, events });
  const conditionText = conditions.map((condition) => describeCondition(condition, fieldLabel)).join(" y ");
  const actionCount = steps.filter((step) => !isPauseStep(step)).length;
  const dropMarkFor = (index) => {
    if (!drag || drag.over !== index || drag.from === index) return null;
    return { edge: drag.over < drag.from ? "top" : "bottom", valid: drag.valid };
  };
  const inspector = current ? (
    <>
      <InspectorHeader
        node={current}
        stepCount={steps.length}
        readOnly={readOnly}
        title={current.kind === "trigger" ? "Cuándo empieza" : current.kind === "conditions" ? "Solo si" : describeStep(steps[current.index], ownerLabel).title}
        subtitle={current.kind === "step" ? `Paso ${current.index + 1} de ${steps.length}` : null}
        onMove={(delta) => move(current.index, current.index + delta)}
        onRemove={() => remove(current.index)}
        onClose={docked ? null : () => setSelectedId(null)}
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

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,1fr)]">
      <div className="min-w-0 space-y-3">
        <ol ref={listRef} aria-label="Flujo de la automatización" className="relative">
          <FlowNode
            nodeId="trigger" icon={MousePointerClick} tone="brand" title={triggerText.title} detail={triggerText.detail}
            selected={current?.id === "trigger"} first onSelect={() => setSelectedId("trigger")} onKeyDown={(event) => onNodeKey(event)}
          />
          {showConditions && (
            <FlowNode
              nodeId="conditions" icon={Filter} title={conditions.length ? "Solo si" : "Siempre"}
              detail={conditions.length ? conditionText : "Sin condiciones: corre cada vez"}
              selected={current?.id === "conditions"} onSelect={() => setSelectedId("conditions")} onKeyDown={(event) => onNodeKey(event)}
            />
          )}
          {steps.map((step, index) => {
            const { title, detail } = describeStep(step, ownerLabel);
            const Icon = stepIcon(step);
            const background = steps.slice(0, index + 1).some(isPauseStep);
            return (
              <Fragment key={index}>
                <FlowSlot
                  options={slotOptions(steps, index)} readOnly={readOnly} onPick={(kind) => insert(index, kind)}
                  background={steps.slice(0, index).some(isPauseStep)}
                  caption={index === firstBackground ? "Desde aquí corre en segundo plano" : null}
                />
                <FlowNode
                  ref={(element) => { itemRefs.current[index] = element; }}
                  nodeId={`step-${index}`} icon={Icon} tone={isPauseStep(step) ? "amber" : "neutral"}
                  title={title} detail={detail} issues={stepIssues(step)} background={background}
                  selected={current?.id === `step-${index}`} dragging={drag?.from === index} dropMark={dropMarkFor(index)}
                  handle={readOnly || steps.length < 2 ? null : handleProps(index)}
                  onSelect={() => setSelectedId(`step-${index}`)} onKeyDown={(event) => onNodeKey(event, index)}
                />
              </Fragment>
            );
          })}
          <FlowEnd
            options={slotOptions(steps, steps.length)} readOnly={readOnly} onPick={(kind) => insert(steps.length, kind)}
            background={steps.some(isPauseStep)} full={slotOptions(steps, steps.length).every((option) => option.disabled)}
          />
        </ol>
        {actionCount > 1 && (
          <SwitchField
            label="Si un paso falla, seguir con los siguientes" checked={automation.onError === "continue"} disabled={readOnly}
            onChange={(checked) => onPatch({ onError: checked ? "continue" : undefined })}
          />
        )}
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Toca un paso para editarlo{docked ? "" : " (se abre desde abajo)"}. Arrastra el asa para reordenar; con teclado, Alt + flechas. La línea punteada marca lo que corre en segundo plano.
        </p>
      </div>

      {docked ? (
        <aside aria-label="Editar paso" className="min-w-0 self-start rounded-lg border border-[hsl(var(--border))] p-4 lg:sticky lg:top-4">
          {inspector}
        </aside>
      ) : (
        <Sheet open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelectedId(null); }}>
          <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-md">
            <SheetHeader className="sr-only">
              <SheetTitle>Editar paso</SheetTitle>
              <SheetDescription>Cambia la configuración del elemento seleccionado.</SheetDescription>
            </SheetHeader>
            {inspector}
          </SheetContent>
        </Sheet>
      )}
    </div>
  );
}
