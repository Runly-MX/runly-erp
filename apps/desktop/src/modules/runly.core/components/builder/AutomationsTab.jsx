// Module Builder — Automatizaciones tab (specs
// docs/superpowers/specs/2026-10-04-builder-automations-design.md §4.5 and
// 2026-10-24-automation-studio-v2-design.md).
// Each card becomes a definition.automations item compiled by
// @runly/module-compiler: when a record of this module is saved (or a system
// event happens), call up to MAX_STEPS services of system modules in order.
import { useMemo, useState } from "react";
import { Button, ConfirmDialog, EmptyState } from "@runly/ui";
import { Globe, Plus, Zap } from "lucide-react";
import { MAX_AUTOMATIONS, SERVICE_CONTRACTS, automationEvents, stepsOf } from "@runly/module-compiler/browser";
import { AutomationCard } from "./AutomationCard";
import { AutomationHostsDialog } from "./AutomationHostsDialog";
import { AutomationRunsPanel } from "./AutomationRunsPanel";
import { serviceLabel } from "./AutomationSteps";

const keyOf = (item) => item.key ?? item.name;

function uniqueKey(taken) {
  let index = taken.size + 1;
  while (taken.has(`automatizacion_${index}`)) index += 1;
  return `automatizacion_${index}`;
}

// Optional keys are removed instead of stored as undefined; `steps` replaces a v1 `action`.
function cleaned(automation) {
  const copy = { ...automation };
  if (copy.steps) delete copy.action;
  if (copy.onError === undefined) delete copy.onError;
  if (copy.trigger?.when === undefined) copy.trigger = Object.fromEntries(Object.entries(copy.trigger ?? {}).filter(([key]) => key !== "when"));
  return copy;
}

export function AutomationsTab({ definition, onChange, readOnly, published = false }) {
  const automations = definition.automations ?? [];
  const entities = definition.entities ?? [];
  const events = useMemo(() => automationEvents(), []);
  const [removeIndex, setRemoveIndex] = useState(null);
  const [hostsOpen, setHostsOpen] = useState(false);
  const used = [...new Set(automations.flatMap((automation) => stepsOf(automation).map((step) => step.service)).filter(Boolean))];

  const setAutomations = (update) => onChange((current) => {
    const next = update(current.automations ?? []);
    const copy = { ...current };
    if (next.length) copy.automations = next; else delete copy.automations;
    return copy;
  });
  const patchAutomation = (index, patch) => setAutomations((list) => list.map((automation, i) => (
    i === index ? cleaned({ ...automation, ...patch }) : automation
  )));
  const addAutomation = () => setAutomations((list) => [...list, {
    key: uniqueKey(new Set(list.map((automation) => automation.key))),
    label: "Nueva automatización",
    enabled: true,
    trigger: { type: "record", entity: keyOf(entities[0] ?? {}), on: "create" },
    steps: [{ service: "", args: {} }],
  }]);

  return (
    <div className="space-y-4 pt-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-2xl text-sm text-[hsl(var(--muted-foreground))]">
          Haz que este módulo trabaje con los demás sin programar: al guardar un registro (o cuando algo pasa en otro módulo) crea un evento de calendario, envía una notificación, guarda un contacto, registra un movimiento y más, en varios pasos.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="outline" onClick={() => setHostsOpen(true)}>
            <Globe className="mr-1 h-4 w-4" /> Destinos permitidos
          </Button>
          {!readOnly && (
            <Button onClick={addAutomation} disabled={automations.length >= MAX_AUTOMATIONS || !entities.length}>
              <Plus className="mr-1 h-4 w-4" /> Nueva automatización
            </Button>
          )}
        </div>
      </div>
      {used.length > 0 && (
        <div className="rounded-lg border border-[hsl(var(--border))] p-3 text-sm">
          <p className="font-medium">Este módulo usará</p>
          <ul className="mt-1 list-disc pl-5 text-[hsl(var(--muted-foreground))]">
            {used.map((key) => <li key={key}>{serviceLabel(key, SERVICE_CONTRACTS[key]?.label ?? key)}</li>)}
          </ul>
          <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">
            Al publicar quedan autorizados si puedes administrar módulos; si no, un administrador debe autorizarlos en Módulos.
          </p>
        </div>
      )}
      {automations.length === 0 ? (
        <EmptyState icon={Zap} title="Sin automatizaciones" description="Crea una para que este módulo agende, notifique o registre información en otros módulos al guardar." />
      ) : automations.map((automation, index) => (
        <AutomationCard
          key={automation.key}
          automation={automation}
          entities={entities}
          events={events}
          readOnly={readOnly}
          onPatch={(patch) => patchAutomation(index, patch)}
          onRemove={() => setRemoveIndex(index)}
        />
      ))}
      <AutomationRunsPanel moduleKey={definition.key} published={published} automations={automations} />
      <AutomationHostsDialog open={hostsOpen} onOpenChange={setHostsOpen} />
      <ConfirmDialog
        open={removeIndex !== null}
        onOpenChange={(open) => !open && setRemoveIndex(null)}
        title="Quitar automatización"
        description="Al publicar dejará de ejecutarse. Lo que ya creó en otros módulos se conserva."
        confirmLabel="Quitar"
        onConfirm={() => { setAutomations((list) => list.filter((_, i) => i !== removeIndex)); setRemoveIndex(null); }}
      />
    </div>
  );
}
