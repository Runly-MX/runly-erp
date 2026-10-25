// Module Builder — one automation card: name, trigger, conditions and steps, in
// two interchangeable views of the same definition: the visual flow (default)
// and the classic form. Works on the v2 shape (`steps`); a v1 `action` is read
// as a single step and rewritten as `steps` on the first edit.
import { Badge, Button, Card, CardContent, SwitchField, TextField } from "@runly/ui";
import { useState } from "react";
import { FlaskConical, Trash2, Zap } from "lucide-react";
import { stepsOf } from "@runly/module-compiler/browser";
import { AutomationConditions } from "./AutomationConditions";
import { AutomationSteps } from "./AutomationSteps";
import { TriggerEditor, fieldOptionsFor } from "./AutomationTrigger";
import { AutomationTestDialog } from "./AutomationTestDialog";
import { AutomationCanvasEditor } from "./canvas/AutomationCanvasEditor";

const VIEW_KEY = "runly.automations.view";
const VIEWS = [{ value: "flow", label: "Lienzo" }, { value: "form", label: "Formulario" }];

// A per-viewer convenience only: the page works without storage.
function readView() {
  try { return window.localStorage.getItem(VIEW_KEY) === "form" ? "form" : "flow"; } catch { return "flow"; }
}
function rememberView(view) {
  try { window.localStorage.setItem(VIEW_KEY, view); } catch { /* storage blocked */ }
}

function ViewSwitch({ value, onChange }) {
  return (
    <div role="group" aria-label="Vista" className="inline-flex rounded-md border border-[hsl(var(--border))] p-0.5">
      {VIEWS.map((view) => (
        <button
          key={view.value}
          type="button"
          aria-pressed={value === view.value}
          onClick={() => onChange(view.value)}
          className={`cursor-pointer rounded-sm px-3 py-1 text-xs font-medium transition-colors [@media(pointer:coarse)]:min-h-10 ${value === view.value ? "bg-(--brand-primary)/15 text-[hsl(var(--foreground))]" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"}`}
        >
          {view.label}
        </button>
      ))}
    </div>
  );
}

// allowedTriggers limits the trigger types (company automations have no records).
export function AutomationCard({ automation, entities, events, allowedTriggers = null, readOnly, onPatch, onRemove }) {
  const trigger = automation.trigger;
  const steps = stepsOf(automation);
  const fieldOptions = fieldOptionsFor(trigger, entities, events);
  const showConditions = trigger.type !== "schedule" || Boolean(trigger.entity);
  const [testOpen, setTestOpen] = useState(false);
  const [view, setView] = useState(readView);
  const changeView = (next) => { setView(next); rememberView(next); };

  return (
    <Card>
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Zap className="h-4 w-4 text-[--color-primary]" />
            <span className="font-medium">{automation.label || "Automatización"}</span>
            {automation.enabled === false && <Badge variant="outline">Pausada</Badge>}
            <span className="font-mono text-xs text-[hsl(var(--muted-foreground))]">{automation.key}</span>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <ViewSwitch value={view} onChange={changeView} />
            <Button variant="outline" size="sm" onClick={() => setTestOpen(true)}>
              <FlaskConical className="mr-1 h-4 w-4" /> Probar
            </Button>
            {!readOnly && (
              <Button variant="ghost" size="sm" onClick={onRemove} aria-label="Quitar automatización">
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <TextField label="Nombre" required value={automation.label ?? ""} disabled={readOnly} maxLength={120}
            onChange={(e) => onPatch({ label: e.target.value })} />
          <SwitchField label="Activa" checked={automation.enabled !== false} disabled={readOnly} onChange={(enabled) => onPatch({ enabled })} />
        </div>
        {view === "flow" ? (
          <AutomationCanvasEditor
            automation={automation} entities={entities} events={events} allowedTriggers={allowedTriggers}
            fieldOptions={fieldOptions} readOnly={readOnly} onPatch={onPatch} className="h-[34rem]"
          />
        ) : (
          <>
            <TriggerEditor automation={automation} entities={entities} events={events} allowedTriggers={allowedTriggers} readOnly={readOnly} onPatch={onPatch} />
            {showConditions && (
              <AutomationConditions trigger={trigger} fieldOptions={fieldOptions} readOnly={readOnly}
                onChange={(when) => onPatch({ trigger: { ...trigger, when } })} />
            )}
            <AutomationSteps steps={steps} triggerType={trigger.type} onError={automation.onError} fieldOptions={fieldOptions} readOnly={readOnly}
              onSteps={(next) => onPatch({ steps: next })} onOnError={(onError) => onPatch({ onError: onError === "continue" ? "continue" : undefined })} />
          </>
        )}
      </CardContent>
      <AutomationTestDialog open={testOpen} onOpenChange={setTestOpen} automation={automation} fieldOptions={fieldOptions} />
    </Card>
  );
}
