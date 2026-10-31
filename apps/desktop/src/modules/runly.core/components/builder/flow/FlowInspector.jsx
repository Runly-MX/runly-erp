// Inspector of the canvas editor: edits the selected block with the same editors
// the form view uses, organised in titled sections. Docked (and resizable) beside
// the canvas on wide screens, a side/bottom sheet elsewhere.
import { Button } from "@runly/ui";
import { ArrowDown, ArrowUp, Maximize2, Minimize2, Trash2, X } from "lucide-react";
import { AutomationConditions } from "../AutomationConditions";
import { InspectorSection } from "../InspectorSection";
import { StepEditor } from "../AutomationSteps";
import { TriggerEditor } from "../AutomationTrigger";

const COARSE = "[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11";

function IconButton({ label, onClick, disabled, children }) {
  return (
    <Button variant="ghost" size="sm" aria-label={label} title={label} disabled={disabled} onClick={onClick} className={COARSE}>
      {children}
    </Button>
  );
}

const TILE = {
  brand: "border-transparent bg-(--brand-primary) text-(--brand-primary-foreground)",
  neutral: "border-[hsl(var(--border))] bg-[hsl(var(--muted))]",
  amber: "border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300",
};

export function InspectorHeader({ icon: Icon, tone = "neutral", kindLabel, title, subtitle, node, stepCount, readOnly, expanded, onToggleExpand, canMove = () => true, onMove, onRemove, onClose }) {
  const isStep = node?.kind === "step";
  return (
    <div className="space-y-2">
    <div className="flex items-start gap-3">
      {Icon && (
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-md border ${TILE[tone] ?? TILE.neutral}`} aria-hidden="true"><Icon className="h-5 w-5" /></span>
      )}
      <div className="min-w-0 flex-1">
        {kindLabel && <p className="text-[11px] leading-4 text-[hsl(var(--muted-foreground))]">{kindLabel}</p>}
        <p className="text-base font-semibold leading-snug">{title}</p>
        {subtitle && <p className="text-xs text-[hsl(var(--muted-foreground))]">{subtitle}</p>}
      </div>
      <div className="flex shrink-0 items-center">
        {onToggleExpand && <IconButton label={expanded ? "Reducir panel" : "Ampliar panel"} onClick={onToggleExpand}>{expanded ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}</IconButton>}
        {onClose && <IconButton label="Cerrar" onClick={onClose}><X className="h-4 w-4" /></IconButton>}
      </div>
    </div>
    {isStep && !readOnly && (
      <div className="flex items-center gap-1 border-y border-[hsl(var(--border))] py-1">
        {(
          <>
            <IconButton label="Mover antes en el flujo" disabled={!canMove(-1)} onClick={() => onMove(-1)}><ArrowUp className="h-4 w-4" /></IconButton>
            <IconButton label="Mover después en el flujo" disabled={!canMove(1)} onClick={() => onMove(1)}><ArrowDown className="h-4 w-4" /></IconButton>
            <IconButton label="Quitar bloque" onClick={onRemove}><Trash2 className="h-4 w-4" /></IconButton>
          </>
        )}
      </div>
    )}
    </div>
  );
}

export function InspectorBody({ node, automation, steps, entities, events, allowedTriggers, fieldOptions, readOnly, onPatch, onStep }) {
  if (!node) return null;
  const trigger = automation.trigger;
  if (node.kind === "trigger") {
    return (
      <InspectorSection title="Cuándo empieza" description="Lo que pone en marcha esta automatización.">
        <TriggerEditor automation={automation} entities={entities} events={events} allowedTriggers={allowedTriggers} readOnly={readOnly} onPatch={onPatch} compact />
      </InspectorSection>
    );
  }
  if (node.kind === "conditions") {
    return (
      <InspectorSection title="Solo si..." description="Si no se cumplen todas las condiciones, la automatización no corre. Sin condiciones, corre siempre.">
        <AutomationConditions trigger={trigger} fieldOptions={fieldOptions} readOnly={readOnly} onChange={(when) => onPatch({ trigger: { ...trigger, when } })} />
      </InspectorSection>
    );
  }
  return (
    <StepEditor
      step={steps[node.index]} steps={steps} index={node.index} triggerType={trigger.type} fieldOptions={fieldOptions}
      recordLink={trigger.type === "event" ? events?.find((event) => event.key === trigger.event)?.link ?? null : null}
      readOnly={readOnly} withServiceSelect onChange={(next) => onStep(node.index, next)}
    />
  );
}
