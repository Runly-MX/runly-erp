// Configuration of the "Recibe datos de otro sistema" trigger: the secret URL,
// the fields the automation expects (detected from a real test message), and how
// the other system has to send them. Spec
// docs/superpowers/specs/2026-10-25-automation-canvas-and-webhooks-design.md.
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, ConfirmDialog, TextField } from "@runly/ui";
import { Plug, Plus, RefreshCw, Trash2, Wifi } from "lucide-react";
import { toast } from "sonner";
import { MAX_WEBHOOK_FIELDS, WEBHOOK_FIELD_KEY } from "@runly/module-compiler/browser";
import { useAuth } from "../../../../auth/AuthProvider";
import { getApiUrl } from "../../../../lib/runtimeConfig";
import { runly } from "../../../../lib/runly";
import { AutomationConnectionsDialog } from "./AutomationConnectionsDialog";
import { CodeSnippet } from "./CodeSnippet";

const RESPONSES = [
  ["202", "Recibido: Runly lo procesa en segundo plano."],
  ["400 / 415", "El cuerpo no es un JSON válido o falta Content-Type: application/json."],
  ["403", "El origen no está en la lista de orígenes permitidos."],
  ["404", "La URL no existe o la automatización está pausada."],
  ["413 / 429", "El mensaje supera 64 KB, o se enviaron más de 60 por minuto."],
];

const humanize = (key) => key.replace(/_/g, " ").replace(/^./, (letter) => letter.toUpperCase());
const sampleOf = (value) => (value === null || value === undefined ? "" : String(value).slice(0, 200));

export function WebhookTriggerPanel({ automation, readOnly, onPatch }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const trigger = automation.trigger;
  const fields = trigger.fields ?? [];
  const secret = automation.webhookToken;
  const url = secret ? `${getApiUrl()}/public/hooks/${secret}` : null;

  const events = useQuery({
    queryKey: ["automation-webhook-events", automation.key],
    queryFn: async () => (await runly.modules.automationWebhookEvents(automation.key, token))?.data ?? [],
    enabled: Boolean(token && secret),
    refetchInterval: 3000,
  });
  const latest = events.data?.[0] ?? null;

  const regenerate = useMutation({
    mutationFn: async () => (await runly.modules.regenerateAutomationWebhook(automation.key, token))?.data,
    onSuccess: (data) => {
      toast.success("Nueva URL generada", { description: "La anterior dejó de funcionar." });
      onPatch({ webhookToken: data.webhookToken });
      queryClient.invalidateQueries({ queryKey: ["system-automations"] });
      setConfirmRegenerate(false);
    },
    onError: (error) => toast.error("No se pudo generar la URL", { description: error.message }),
  });

  const setFields = (next) => onPatch({ trigger: { ...trigger, fields: next } });
  const useMessage = () => {
    const detected = Object.entries(latest.data).slice(0, MAX_WEBHOOK_FIELDS)
      .filter(([key]) => WEBHOOK_FIELD_KEY.test(key))
      .map(([key, value]) => ({ key, label: humanize(key), sample: sampleOf(value) }));
    setFields(detected);
    toast.success(`${detected.length} campos detectados`);
  };
  const exampleBody = JSON.stringify(
    fields.length ? Object.fromEntries(fields.map((field) => [field.key, field.sample || "..."])) : { cliente: { nombre: "Ana" }, total: 1250 },
    null,
    2,
  );
  const curl = url ? `curl -X POST "${url}" \\\n  -H "Content-Type: application/json" \\\n  -d '${exampleBody.replace(/\n\s*/g, " ")}'` : "";

  return (
    <div className="space-y-5 sm:col-span-2">
      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Dirección para recibir datos</h3>
        {url ? (
          <>
            <CodeSnippet value={url} label="Copiar la URL" />
            <div className="flex flex-wrap items-center gap-2">
              <p className="min-w-0 flex-1 text-xs text-[hsl(var(--muted-foreground))]">Es secreta: quien la conozca puede enviar mensajes. Pégala en el otro sistema como destino del webhook.</p>
              {!readOnly && <Button variant="outline" size="sm" onClick={() => setConfirmRegenerate(true)}><RefreshCw className="mr-1 h-4 w-4" /> Generar otra</Button>}
            </div>
          </>
        ) : (
          <p className="rounded-md border border-dashed border-[hsl(var(--border))] p-3 text-sm text-[hsl(var(--muted-foreground))]">
            Guarda la automatización y aquí aparecerá su URL secreta.
          </p>
        )}
        <Button variant="ghost" size="sm" onClick={() => setConnectionsOpen(true)}><Plug className="mr-1 h-4 w-4" /> Orígenes permitidos y ayuda</Button>
      </section>

      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold">Campos que recibe</h3>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Con ellos eliges condiciones y datos en los demás bloques. Los datos anidados se aplanan: <code>cliente.nombre</code> llega como <code>cliente_nombre</code>.</p>
        </div>
        {secret && (
          <div className="rounded-md border border-[hsl(var(--border))] p-3">
            <p className="flex items-center gap-2 text-sm font-medium"><Wifi className="h-4 w-4 text-(--brand-primary)" aria-hidden="true" /> {latest ? "Último mensaje recibido" : "Escuchando un mensaje de prueba..."}</p>
            {latest ? (
              <>
                <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">{new Date(latest.createdAt).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "medium" })}{latest.sourceIp ? ` · desde ${latest.sourceIp}` : ""}</p>
                <dl className="mt-2 grid gap-x-3 gap-y-1 text-xs sm:grid-cols-[auto_1fr]">
                  {Object.entries(latest.data).slice(0, 12).map(([key, value]) => (
                    <div key={key} className="contents"><dt className="font-mono text-[hsl(var(--muted-foreground))]">{key}</dt><dd className="truncate">{sampleOf(value) || "(vacío)"}</dd></div>
                  ))}
                </dl>
                {!readOnly && <Button size="sm" className="mt-3" onClick={useMessage}>Usar los campos de este mensaje</Button>}
              </>
            ) : (
              <p className="mt-1 text-xs text-[hsl(var(--muted-foreground))]">Envía un mensaje desde el otro sistema (o con el ejemplo de abajo) y aparecerá aquí con sus campos.</p>
            )}
          </div>
        )}
        <ul className="space-y-2">
          {fields.map((field, index) => (
            <li key={index} className="grid gap-2 rounded-md border border-[hsl(var(--border))] p-2.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <TextField label="Campo" value={field.key} disabled={readOnly} maxLength={61}
                    onChange={(e) => setFields(fields.map((item, i) => (i === index ? { ...item, key: e.target.value.replace(/[^a-zA-Z0-9_]/g, "") } : item)))} />
                </div>
                {!readOnly && <Button variant="ghost" size="sm" aria-label="Quitar campo" onClick={() => setFields(fields.filter((_, i) => i !== index))} className="mt-6 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"><Trash2 className="h-4 w-4" /></Button>}
              </div>
              <TextField label="Nombre visible" value={field.label ?? ""} disabled={readOnly} maxLength={80}
                onChange={(e) => setFields(fields.map((item, i) => (i === index ? { ...item, label: e.target.value } : item)))} />
            </li>
          ))}
        </ul>
        {!readOnly && fields.length < MAX_WEBHOOK_FIELDS && (
          <Button variant="outline" size="sm" onClick={() => setFields([...fields, { key: `campo${fields.length + 1}`, label: "" }])}><Plus className="mr-1 h-4 w-4" /> Agregar campo</Button>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold">Cómo enviar los datos</h3>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Un POST con cuerpo JSON y el encabezado <code>Content-Type: application/json</code>. No necesita más autenticación: la URL es la llave.</p>
        {url && <CodeSnippet value={curl} label="Copiar el ejemplo de envío" />}
        <dl className="grid gap-x-3 gap-y-1 text-xs sm:grid-cols-[5.5rem_1fr]">
          {RESPONSES.map(([code, text]) => <div key={code} className="contents"><dt className="font-mono font-medium">{code}</dt><dd className="text-[hsl(var(--muted-foreground))]">{text}</dd></div>)}
        </dl>
      </section>

      <ConfirmDialog
        open={confirmRegenerate}
        onOpenChange={setConfirmRegenerate}
        title="Generar otra URL"
        description="La URL actual dejará de funcionar de inmediato: tendrás que actualizarla en el otro sistema."
        confirmLabel="Generar otra"
        onConfirm={() => regenerate.mutate()}
      />
      <AutomationConnectionsDialog open={connectionsOpen} onOpenChange={setConnectionsOpen} />
    </div>
  );
}
