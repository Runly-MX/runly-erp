// "Para cada uno" block (spec docs/superpowers/specs/2026-10-31-automations-retries-loops-date-triggers-design.md §B):
// what to search, which results count, and 1-3 actions done with each one. Inside
// the actions, the fields of the current result come first in every data picker.
import { Button, SelectField } from "@runly/ui";
import { Plus, Trash2 } from "lucide-react";
import { MAX_LOOP_ACTIONS, MAX_LOOP_ITEMS, SERVICE_CONTRACTS, automationServices } from "@runly/module-compiler/browser";
import { AutomationArgsEditor } from "./AutomationArgsEditor";
import { AutomationConditions } from "./AutomationConditions";
import { InspectorSection } from "./InspectorSection";
import { friendlyLabel, loopItemOptions } from "../../lib/flowModel";

export function LoopStepEditor({ step, triggerType, afterDelay, recordLink, fieldOptions, readOnly, serviceLabel, onChange }) {
  const trigger = triggerType === "record" ? "record" : "event";
  const searches = automationServices({ trigger, afterDelay, search: true });
  const actions = automationServices({ trigger, afterDelay });
  const search = SERVICE_CONTRACTS[step.service];
  const itemOptions = loopItemOptions(step);
  const list = step.do ?? [];
  const setAction = (at, next) => onChange({ ...step, do: list.map((action, i) => (i === at ? next : action)) });
  return (
    <div className="space-y-4">
      <InspectorSection title="Qué buscar" description={`Repite las acciones con cada resultado, hasta ${MAX_LOOP_ITEMS}.`}>
        <SelectField label="Buscar" options={searches.map((service) => ({ value: service.key, label: serviceLabel(service.key, service.label) }))}
          value={step.service ?? ""} disabled={readOnly} placeholder="Elige qué buscar"
          onValueChange={(service) => onChange({ ...step, service, args: {}, when: undefined })} />
        {search && (
          <AutomationArgsEditor contract={search} args={step.args ?? {}} triggerType={triggerType} fieldOptions={fieldOptions} readOnly={readOnly}
            onChange={(args) => onChange({ ...step, args })} />
        )}
      </InspectorSection>
      {search && (
        <InspectorSection title="Solo los que..." description="Sin condiciones, usa todos los resultados.">
          <AutomationConditions trigger={{ type: "event", when: step.when }} heading="Si el resultado..."
            fieldOptions={search.itemReturns.map((key) => ({ value: key, label: friendlyLabel(key) }))} readOnly={readOnly}
            onChange={(when) => onChange({ ...step, when })} />
        </InspectorSection>
      )}
      <InspectorSection title="Con cada uno" description="Se hacen en orden. Si falla con un resultado, sigue con los demás.">
        <ol className="space-y-3">
          {list.map((action, at) => (
            <li key={at} className="space-y-3 rounded-lg border border-[hsl(var(--border))] p-3">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1">
                  <SelectField label={`Acción ${at + 1}`} options={actions.map((service) => ({ value: service.key, label: serviceLabel(service.key, service.label) }))}
                    value={action.service ?? ""} disabled={readOnly} placeholder="Elige una acción"
                    onValueChange={(service) => setAction(at, { service, args: {} })} />
                </div>
                {!readOnly && list.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" aria-label={`Quitar la acción ${at + 1}`} className="[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"
                    onClick={() => onChange({ ...step, do: list.filter((_, i) => i !== at) })}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {SERVICE_CONTRACTS[action.service] && (
                <AutomationArgsEditor contract={SERVICE_CONTRACTS[action.service]} args={action.args ?? {}} triggerType={triggerType} recordLink={recordLink}
                  fieldOptions={[...itemOptions, ...fieldOptions]} readOnly={readOnly} onChange={(args) => setAction(at, { ...action, args })} />
              )}
            </li>
          ))}
        </ol>
        {!readOnly && list.length < MAX_LOOP_ACTIONS && (
          <Button type="button" variant="outline" size="sm" className="gap-1.5 [@media(pointer:coarse)]:h-11" onClick={() => onChange({ ...step, do: [...list, { service: "", args: {} }] })}>
            <Plus className="h-4 w-4" /> Agregar acción
          </Button>
        )}
      </InspectorSection>
    </div>
  );
}
