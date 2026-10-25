// Inspector of the visual automation editor: edits the selected node with the
// same editors the form view uses. Docked beside the flow on wide screens, a
// side/bottom sheet elsewhere (the Sheet turns into a bottom sheet on phones).
import { Button } from "@runly/ui";
import { ArrowDown, ArrowUp, Trash2, X } from "lucide-react";
import { AutomationConditions } from "../AutomationConditions";
import { StepEditor } from "../AutomationSteps";
import { TriggerEditor } from "../AutomationTrigger";

function IconButton({ label, onClick, disabled, children }) {
  return (
    <Button variant="ghost" size="sm" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className="[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11">
      {children}
    </Button>
  );
}

export function InspectorHeader({ title, subtitle, node, stepCount, readOnly, onMove, onRemove, onClose }) {
  const isStep = node?.kind === "step";
  return (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{title}</p>
        {subtitle && <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center">
        {isStep && !readOnly && (
          <>
            <IconButton label="Subir paso" disabled={node.index === 0} onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" /></IconButton>
            <IconButton label="Bajar paso" disabled={node.index === stepCount - 1} onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" /></IconButton>
            <IconButton label="Quitar paso" onClick={onRemove}><Trash2 className="h-4 w-4" /></IconButton>
          </>
        )}
        {onClose && <IconButton label="Cerrar" onClick={onClose}><X className="h-4 w-4" /></IconButton>}
      </div>
    </div>
  );
}

export function InspectorBody({ node, automation, steps, entities, events, allowedTriggers, fieldOptions, readOnly, onPatch, onStep }) {
  if (!node) return null;
  const trigger = automation.trigger;
  if (node.kind === "trigger") {
    return <TriggerEditor automation={automation} entities={entities} events={events} allowedTriggers={allowedTriggers} readOnly={readOnly} onPatch={onPatch} />;
  }
  if (node.kind === "conditions") {
    return (
      <div className="space-y-3">
        <AutomationConditions trigger={trigger} fieldOptions={fieldOptions} readOnly={readOnly} onChange={(when) => onPatch({ trigger: { ...trigger, when } })} />
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          Si no se cumplen todas, la automatización no corre. Sin condiciones, corre siempre.
        </p>
      </div>
    );
  }
  return (
    <StepEditor
      step={steps[node.index]} steps={steps} index={node.index} triggerType={trigger.type} fieldOptions={fieldOptions}
      readOnly={readOnly} withServiceSelect onChange={(next) => onStep(node.index, next)}
    />
  );
}
