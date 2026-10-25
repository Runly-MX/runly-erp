// "Conexiones externas": who Runly may talk to. Two directions in one place:
// - Recibir: the origins (IPs / networks) allowed to send webhooks to company
//   automations (empty = anyone who knows the secret URL).
// - Enviar: the hosts the "Llamar a una URL" block may call.
// Everyone reads the lists; administrators (core.modules.manage) edit them.
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Tabs, TabsContent, TabsList, TabsTrigger, TextField } from "@runly/ui";
import { Plug, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "../../../../auth/AuthProvider";
import { getApiUrl } from "../../../../lib/runtimeConfig";
import { runly } from "../../../../lib/runly";
import { CodeSnippet } from "./CodeSnippet";

// Picture of the two directions. Uses the theme tokens so it works in light and dark.
function ConnectionsDiagram() {
  return (
    <svg viewBox="0 0 560 150" role="img" aria-label="Entrada: otro sistema envía datos a Runly. Salida: Runly envía datos a otro sistema" className="h-auto w-full text-[hsl(var(--foreground))]">
      <defs>
        <marker id="conn-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1 L9 5 L0 9 z" className="fill-(--brand-primary)" /></marker>
        <marker id="conn-arrow-muted" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0 1 L9 5 L0 9 z" className="fill-[hsl(var(--muted-foreground))]" /></marker>
      </defs>
      {[{ x: 8, label: "Sistema de origen", sub: "tienda, CRM, formulario..." }, { x: 432, label: "Sistema de destino", sub: "API, ERP, chat..." }].map((box) => (
        <g key={box.x}>
          <rect x={box.x} y="38" width="120" height="74" rx="10" className="fill-[hsl(var(--card))] stroke-[hsl(var(--border))]" strokeWidth="1.5" />
          <rect x={box.x + 14} y="52" width="92" height="9" rx="3" className="fill-[hsl(var(--muted))]" />
          <rect x={box.x + 14} y="66" width="64" height="9" rx="3" className="fill-[hsl(var(--muted))]" />
          <text x={box.x + 60} y="96" textAnchor="middle" className="fill-current text-[11px] font-semibold">{box.label}</text>
          <text x={box.x + 60} y="108" textAnchor="middle" className="fill-[hsl(var(--muted-foreground))] text-[9px]">{box.sub}</text>
        </g>
      ))}
      <rect x="215" y="26" width="130" height="98" rx="12" className="fill-(--brand-primary)/12 stroke-(--brand-primary)" strokeWidth="1.5" />
      <text x="280" y="70" textAnchor="middle" className="fill-current text-[18px] font-bold">Runly</text>
      <text x="280" y="88" textAnchor="middle" className="fill-[hsl(var(--muted-foreground))] text-[10px]">tus automatizaciones</text>
      <path d="M130 64 H213" fill="none" strokeWidth="2" className="stroke-(--brand-primary)" markerEnd="url(#conn-arrow)" />
      <text x="172" y="54" textAnchor="middle" className="fill-current text-[10px] font-medium">ENTRADA</text>
      <text x="172" y="78" textAnchor="middle" className="fill-[hsl(var(--muted-foreground))] text-[9px]">avisa a Runly</text>
      <path d="M347 90 H430" fill="none" strokeWidth="2" strokeDasharray="5 5" className="stroke-[hsl(var(--muted-foreground))]" markerEnd="url(#conn-arrow-muted)" />
      <text x="389" y="82" textAnchor="middle" className="fill-current text-[10px] font-medium">SALIDA</text>
      <text x="389" y="104" textAnchor="middle" className="fill-[hsl(var(--muted-foreground))] text-[9px]">Runly avisa</text>
    </svg>
  );
}

function ListEditor({ values, onChange, canManage, label, placeholder, empty }) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = draft.trim();
    if (!value || values.includes(value)) return;
    onChange([...values, value]);
    setDraft("");
  };
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {values.length === 0 && <span className="text-sm text-[hsl(var(--muted-foreground))]">{empty}</span>}
        {values.map((value) => (
          <Badge key={value} variant="secondary" className="gap-1.5 py-1 font-mono text-xs">
            {value}
            {canManage && (
              <button type="button" aria-label={`Quitar ${value}`} className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm hover:bg-[hsl(var(--card))] [@media(pointer:coarse)]:h-8 [@media(pointer:coarse)]:w-8" onClick={() => onChange(values.filter((item) => item !== value))}>
                <X className="h-3 w-3" />
              </button>
            )}
          </Badge>
        ))}
      </div>
      {canManage && (
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <TextField label={label} value={draft} placeholder={placeholder} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
          </div>
          <Button variant="outline" onClick={add} className="[@media(pointer:coarse)]:h-11"><Plus className="mr-1 h-4 w-4" /> Agregar</Button>
        </div>
      )}
    </div>
  );
}

const SAMPLE_BODY = `{
  "module": "system.automations",
  "automation": "aviso_pedido",
  "companyId": "…",
  "idempotencyKey": "aviso_pedido:0198…",
  "data": { "folio": "OS-1042" }
}`;

export function AutomationConnectionsDialog({ open, onOpenChange }) {
  const { session } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();
  const [hosts, setHosts] = useState([]);
  const [origins, setOrigins] = useState([]);

  const hostsQuery = useQuery({
    queryKey: ["automation-http-hosts"],
    queryFn: async () => (await runly.modules.automationHttpHosts(token))?.data ?? { hosts: [], canManage: false },
    enabled: open && Boolean(token),
  });
  const originsQuery = useQuery({
    queryKey: ["automation-webhook-origins"],
    queryFn: async () => (await runly.modules.automationWebhookOrigins(token))?.data ?? { origins: [] },
    enabled: open && Boolean(token),
    retry: false,
  });
  const canManage = Boolean(hostsQuery.data?.canManage);
  useEffect(() => { if (open && hostsQuery.data) setHosts(hostsQuery.data.hosts ?? []); }, [open, hostsQuery.data]);
  useEffect(() => { if (open && originsQuery.data) setOrigins(originsQuery.data.origins ?? []); }, [open, originsQuery.data]);

  const save = useMutation({
    mutationFn: async () => {
      const sent = await runly.modules.setAutomationHttpHosts(hosts, token);
      if (sent?.error) throw new Error(sent.error);
      if (originsQuery.isSuccess) {
        const received = await runly.modules.setAutomationWebhookOrigins(origins, token);
        if (received?.error) throw new Error(received.error);
      }
    },
    onSuccess: () => {
      toast.success("Conexiones actualizadas");
      queryClient.invalidateQueries({ queryKey: ["automation-http-hosts"] });
      queryClient.invalidateQueries({ queryKey: ["automation-webhook-origins"] });
      onOpenChange(false);
    },
    onError: (error) => toast.error("No se pudo guardar", { description: error.message }),
  });

  const exampleUrl = `${getApiUrl()}/public/hooks/<tu-token-secreto>`;
  const curl = `curl -X POST "${exampleUrl}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"cliente":{"nombre":"Ana"},"total":1250}'`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="2xl" className="flex max-h-[92dvh] flex-col md:max-w-3xl">
        <DialogHeader icon={Plug}>
          <DialogTitle>Conexiones con otros sistemas</DialogTitle>
          <DialogDescription>Entrada: otro sistema le avisa a Runly y se ejecuta una automatización. Salida: una automatización de Runly le avisa a otro sistema.</DialogDescription>
        </DialogHeader>
        <div className="-mx-6 min-h-0 flex-1 space-y-5 overflow-y-auto px-6 pb-1">
          <div className="rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-4"><ConnectionsDiagram /></div>

          <Tabs defaultValue="receive" className="space-y-4">
            <TabsList>
              <TabsTrigger value="receive">Entrada: otros → Runly</TabsTrigger>
              <TabsTrigger value="send">Salida: Runly → otros</TabsTrigger>
            </TabsList>

            <TabsContent value="receive" className="space-y-5">
              <ol className="space-y-3 text-sm">
                <li><span className="font-medium">1. Crea una automatización</span> con el disparador «Recibe datos de otro sistema».</li>
                <li><span className="font-medium">2. Copia su URL secreta</span> (es la dirección de Runly) y pégala en el otro sistema como destino de su webhook.</li>
                <li><span className="font-medium">3. El otro sistema envía un JSON con POST a esa URL.</span> Runly lo recibe, separa los campos y ejecuta los bloques de tu flujo. Así se vería el envío desde el otro sistema:</li>
              </ol>
              <CodeSnippet value={curl} label="Copiar el ejemplo de envío" />
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Quién puede avisarle a Runly</h3>
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Direcciones IP o redes desde las que Runly acepta mensajes. Si la lista está vacía, cualquier sistema que conozca la URL secreta puede enviar; agrega las IP de tu proveedor para aceptar solo esas. Trata la URL como una contraseña: si se filtra, genera otra desde la automatización.
                </p>
                {originsQuery.isError ? (
                  <p className="text-xs text-red-600">No se pudo cargar la lista de orígenes.</p>
                ) : (
                  <ListEditor values={origins} onChange={setOrigins} canManage={canManage} label="Agregar origen" placeholder="203.0.113.7 o 203.0.113.0/24" empty="Sin restricciones: cualquiera con la URL secreta puede enviar." />
                )}
              </div>
            </TabsContent>

            <TabsContent value="send" className="space-y-5">
              <p className="text-sm">
                Cuando una automatización usa el bloque «Llamar a una URL», <strong>Runly</strong> envía un JSON por HTTPS al servidor que indiques, siempre que esté en esta lista de destinos permitidos. No se permiten direcciones internas ni redirecciones.
              </p>
              <ListEditor values={hosts} onChange={setHosts} canManage={canManage} label="Agregar servidor de destino" placeholder="hooks.ejemplo.com" empty="Aún no hay destinos: las llamadas HTTP fallarán." />
              <div className="space-y-2">
                <h3 className="text-sm font-semibold">Qué recibe el otro sistema (enviado por Runly)</h3>
                <CodeSnippet value={SAMPLE_BODY} label="Copiar el ejemplo del cuerpo" />
                <p className="text-xs text-[hsl(var(--muted-foreground))]">
                  Con los encabezados <code>X-Runly-Signature</code> (<code>sha256=</code> más el HMAC-SHA256 del cuerpo exacto) y <code>X-Runly-Idempotency-Key</code>, para verificar el origen y evitar duplicados.
                </p>
              </div>
            </TabsContent>
          </Tabs>
          {!canManage && <p className="text-xs text-[hsl(var(--muted-foreground))]">Solo quien administra módulos puede cambiar estas listas.</p>}
        </div>
        <DialogFooter className="shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>{canManage ? "Cancelar" : "Cerrar"}</Button>
          {canManage && <Button disabled={save.isPending} onClick={() => save.mutate()}>{save.isPending ? "Guardando..." : "Guardar"}</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
