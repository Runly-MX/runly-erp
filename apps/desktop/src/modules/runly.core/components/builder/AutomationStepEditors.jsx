// Module Builder — editors of the built-in automation steps that are not a
// service call: "Llamar a una URL" (HTTP) and "Pedir aprobación" (spec
// 2026-10-25-automation-studio-v2-stage-c-reach-design.md, C2/C3).
import { PeoplePicker } from "./PeoplePicker";
import { useQuery } from "@tanstack/react-query";
import { Badge, Button, SelectField, TextField } from "@runly/ui";
import { Plus, Trash2, X } from "lucide-react";
import { MAX_APPROVERS } from "@runly/module-compiler/browser";
import { useAuth } from "../../../../auth/AuthProvider";
import { runly } from "../../../../lib/runly";
import { ValueInput, sourceOptions } from "./AutomationArgsEditor";

const METHOD_OPTIONS = ["POST", "PUT", "PATCH"].map((value) => ({ value, label: value }));
const STRING_SPEC = { type: "string" };

function hostOf(url) {
  try { return new URL(String(url)).hostname.toLowerCase(); } catch { return null; }
}

export function HttpStepEditor({ step, triggerType, fieldOptions, readOnly, onChange }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const hostsQuery = useQuery({
    queryKey: ["automation-http-hosts"],
    queryFn: async () => (await runly.modules.automationHttpHosts(token))?.data ?? { hosts: [], canManage: false },
    enabled: Boolean(token),
    staleTime: 60 * 1000,
  });
  const host = hostOf(step.url);
  const allowed = hostsQuery.data?.hosts ?? [];
  const body = step.body ?? {};
  const names = Object.keys(body);
  const setBody = (next) => onChange({ ...step, body: next });
  const rename = (from, to) => setBody(Object.fromEntries(Object.entries(body).map(([key, value]) => [key === from ? to : key, value])));
  const addEntry = () => {
    let index = names.length + 1;
    while (Object.hasOwn(body, `dato${index}`)) index += 1;
    setBody({ ...body, [`dato${index}`]: { from: "value", value: "" } });
  };

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
        <SelectField label="Método" options={METHOD_OPTIONS} value={step.method ?? "POST"} disabled={readOnly} onValueChange={(method) => onChange({ ...step, method })} />
        <TextField label="Dirección (https)" value={step.url ?? ""} disabled={readOnly} placeholder="https://hooks.ejemplo.com/runly" maxLength={300}
          onChange={(e) => onChange({ ...step, url: e.target.value.trim() })} />
      </div>
      {host && hostsQuery.isSuccess && !allowed.includes(host) && (
        <p className="text-xs text-amber-700 dark:text-amber-400">
          «{host}» aún no está en los destinos permitidos; la llamada fallará hasta que un administrador lo agregue (botón «Conexiones»).
        </p>
      )}
      <div className="space-y-2">
        <p className="text-sm font-medium">Datos que se envían (JSON)</p>
        {names.length === 0 && <p className="text-xs text-[hsl(var(--muted-foreground))]">Sin datos: se envía solo el identificador de la automatización.</p>}
        {names.map((name) => {
          const source = body[name];
          return (
            <div key={name} className="grid gap-2 sm:grid-cols-[minmax(0,10rem)_minmax(0,12rem)_1fr_auto] sm:items-center">
              <TextField aria-label="Nombre del dato" value={name} disabled={readOnly} maxLength={41}
                onChange={(e) => e.target.value && !Object.hasOwn(body, e.target.value) && rename(name, e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))} />
              <SelectField aria-label="Origen" options={sourceOptions({ required: true, triggerType })} value={source?.from ?? "value"} disabled={readOnly}
                onValueChange={(from) => setBody({ ...body, [name]: { from } })} />
              <ValueInput name={name} spec={STRING_SPEC} source={source ?? { from: "value" }} fieldOptions={fieldOptions} readOnly={readOnly}
                onSource={(next) => setBody({ ...body, [name]: next })} />
              {!readOnly && (
                <Button variant="ghost" size="sm" aria-label="Quitar dato" onClick={() => setBody(Object.fromEntries(Object.entries(body).filter(([key]) => key !== name)))}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
        {!readOnly && names.length < 20 && (
          <Button variant="outline" size="sm" onClick={addEntry}><Plus className="mr-1 h-4 w-4" /> Agregar dato</Button>
        )}
      </div>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        Se firma con HMAC-SHA256 en el encabezado X-Runly-Signature y lleva X-Runly-Idempotency-Key para que el receptor evite duplicados. No se admiten encabezados propios.
      </p>
    </div>
  );
}

export function ApprovalStepEditor({ step, readOnly, onChange }) {
  return (
    <div className="space-y-3">
      <TextField label="Mensaje para quien aprueba" value={step.message ?? ""} disabled={readOnly} maxLength={200} placeholder="Ej. Aprobar la orden {{folio}}"
        onChange={(e) => onChange({ ...step, message: e.target.value })} />
      <PeoplePicker label="Quién puede aprobar" value={step.approvers ?? []} max={MAX_APPROVERS} readOnly={readOnly} emptyText="Elige al menos una persona."
        onChange={(approvers) => onChange({ ...step, approvers })} />
      <TextField label="Publicar también en un canal (opcional)" value={step.channel ?? ""} disabled={readOnly} maxLength={120} placeholder="Nombre del canal, ej. aprobaciones"
        hint="La solicitud aparece con botones Aprobar y Rechazar. Solo quienes aprueban pueden usarlos; el canal debe ser de la empresa."
        onChange={(e) => onChange({ ...step, channel: e.target.value })} />
      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        Cualquiera de ellas puede aprobar o rechazar, una sola vez. Recibe una notificación y la ve en Inicio («Aprobaciones»). Si nadie responde en 7 días, la ejecución se cancela. Los pasos que siguen corren en segundo plano.
      </p>
    </div>
  );
}
