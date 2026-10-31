// Inspector of the canvas editor: edits the selected block with the same editors
// the form view uses, organised in titled sections. Docked (and resizable) beside
// the canvas on wide screens, a side/bottom sheet elsewhere.
import { Button, DateField, SelectField, SwitchField } from "@runly/ui";
import { ArrowDown, ArrowUp, Maximize2, Minimize2, Trash2, X } from "lucide-react";
import { AutomationConditions } from "../AutomationConditions";
import { InspectorSection } from "../InspectorSection";
import { StepEditor } from "../AutomationSteps";
import { TriggerEditor } from "../AutomationTrigger";
import { dateSourceOf } from "../../../lib/flowModel";

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

const ONCE_HOURS = [[1, "1 hora"], [4, "4 horas"], [12, "12 horas"], [24, "1 día"], [48, "2 días"], [168, "1 semana"], [720, "30 días"]].map(([value, label]) => ({ value: String(value), label }));

// Company automations: the days it may run (a vacation answer, a campaign) and
// "no repetir" for the same conversation, record or person within some hours.
function ScheduleWindow({ automation, fieldOptions, readOnly, onPatch }) {
  const active = automation.active ?? {};
  const once = automation.once ?? null;
  const setActive = (patch) => {
    const next = { ...active, ...patch };
    for (const key of Object.keys(next)) if (!next[key]) delete next[key];
    onPatch({ active: Object.keys(next).length ? next : undefined });
  };
  return (
    <InspectorSection title="Cuándo está activa" description="Opcional: solo corre en esos días y no se repite para lo mismo.">
      <div className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <DateField label="Desde" value={active.from ?? ""} disabled={readOnly} onChange={(e) => setActive({ from: e.target.value })} />
          <DateField label="Hasta" value={active.until ?? ""} disabled={readOnly} onChange={(e) => setActive({ until: e.target.value })} />
        </div>
        {active.from && active.until && active.from > active.until && <p className="text-xs text-red-700 dark:text-red-300">«Desde» no puede ser después de «Hasta».</p>}
        <SelectField label="No repetir para el mismo" value={once?.field ?? "__always"} disabled={readOnly}
          options={[{ value: "__always", label: "Correr siempre" }, ...fieldOptions.map((option) => ({ value: option.value, label: option.label }))]}
          onValueChange={(field) => onPatch({ once: field === "__always" ? undefined : { field, hours: once?.hours ?? 24 } })} />
        {once && (
          <SelectField label="Durante" options={ONCE_HOURS} value={String(once.hours)} disabled={readOnly}
            onValueChange={(hours) => onPatch({ once: { ...once, hours: Number(hours) } })} />
        )}
      </div>
    </InspectorSection>
  );
}

export function InspectorBody({ node, automation, steps, entities, events, allowedTriggers, fieldOptions, readOnly, onPatch, onStep, retries = false }) {
  if (!node) return null;
  const trigger = automation.trigger;
  if (node.kind === "trigger") {
    const tolerant = automation.onError === "continue";
    return (
      <div className="space-y-4">
        <InspectorSection title="Cuándo empieza" description="Lo que pone en marcha esta automatización.">
          <TriggerEditor automation={automation} entities={entities} events={events} allowedTriggers={allowedTriggers} readOnly={readOnly} onPatch={onPatch} compact />
        </InspectorSection>
        <InspectorSection title="Si algo falla" description="Qué hace cuando un bloque no se puede completar.">
          <div className="space-y-3">
            {steps.length > 1 && (
              <SwitchField label="Seguir con los bloques siguientes" checked={tolerant} disabled={readOnly}
                onChange={(checked) => onPatch({ onError: checked ? "continue" : undefined })} />
            )}
            {retries && (
              <>
                <SwitchField label="Reintentar sola" checked={automation.retry !== false && !tolerant} disabled={readOnly || tolerant}
                  onChange={(checked) => onPatch({ retry: checked ? undefined : false })} />
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  {tolerant
                    ? "Como sigue con los bloques siguientes, no se reintenta."
                    : "Si otro módulo o sistema no responde, vuelve a intentar desde el bloque que falló hasta 5 veces (a 1, 5, 15 y 60 minutos). Si el error es de permisos o de datos, se detiene y te avisa; desde la consola puedes reintentarla cuando lo corrijas."}
                </p>
              </>
            )}
          </div>
        </InspectorSection>
        {retries && <ScheduleWindow automation={automation} fieldOptions={fieldOptions} readOnly={readOnly} onPatch={onPatch} />}
      </div>
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
      recordLink={trigger.type === "event" ? events?.find((event) => event.key === trigger.event)?.link ?? null : dateSourceOf(trigger)?.link ?? null}
      readOnly={readOnly} withServiceSelect onChange={(next) => onStep(node.index, next)}
    />
  );
}
