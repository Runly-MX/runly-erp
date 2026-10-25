// Runly Core > Automatizaciones: the automations of the company that are not tied
// to a module. This screen is the list; each automation opens in a full-screen
// canvas editor (SystemAutomationEditor). Spec
// docs/superpowers/specs/2026-10-25-system-automations-design.md and
// 2026-10-25-automation-canvas-and-webhooks-design.md.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Badge, Button, EmptyState, ErrorState, PageHeader, Skeleton, Switch, TextField } from "@runly/ui";
import { Plug, Plus, Search, SearchX, Zap } from "lucide-react";
import { toast } from "sonner";
import { automationEvents } from "@runly/module-compiler/browser";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";
import { describeTrigger } from "../../runly.core/lib/flowModel";
import { AutomationConnectionsDialog } from "../../runly.core/components/builder/AutomationConnectionsDialog";
import { AutomationMiniFlow } from "../../runly.core/components/builder/AutomationMiniFlow";
import { AutomationRunsPanel } from "../../runly.core/components/builder/AutomationRunsPanel";
import { NewAutomationDialog } from "../../runly.core/components/builder/NewAutomationDialog";

const SYSTEM_MODULE_KEY = "system.automations";
const EDITOR_PATH = "/app/m/runly.automations";
const FILTERS = [{ value: "all", label: "Todas" }, { value: "active", label: "Activas" }, { value: "paused", label: "Pausadas" }];
const RUN_STATUS = {
  success: { label: "Correcta", variant: "success" }, partial: { label: "Parcial", variant: "warning" }, failed: { label: "Falló", variant: "destructive" },
  running: { label: "En curso", variant: "secondary" }, waiting: { label: "En espera", variant: "warning" }, cancelled: { label: "Cancelada", variant: "outline" }, rejected: { label: "Rechazada", variant: "destructive" },
};
const TRIGGER_LABEL = { event: "Evento", schedule: "Horario", webhook: "Webhook" };

function relativeTime(value) {
  const seconds = Math.max(1, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "hace un momento";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  return `hace ${Math.round(hours / 24)} d`;
}

function AutomationCardItem({ item, events, onOpen, onToggle, toggling }) {
  const text = describeTrigger(item.trigger, { events });
  const run = item.lastRun;
  return (
    <li className="group relative flex flex-col gap-4 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 transition-colors hover:border-[hsl(var(--muted-foreground))]/50 focus-within:border-(--brand-primary)/50">
      <div className="flex items-start justify-between gap-3">
        <AutomationMiniFlow automation={item} />
        <label className="relative z-10 flex shrink-0 cursor-pointer items-center gap-2 text-xs text-[hsl(var(--muted-foreground))] [@media(pointer:coarse)]:min-h-11">
          {item.enabled ? "Activa" : "Pausada"}
          <Switch checked={item.enabled} disabled={toggling} onCheckedChange={() => onToggle(item)} aria-label={`${item.enabled ? "Pausar" : "Activar"} ${item.label}`} />
        </label>
      </div>
      <div className="min-w-0 flex-1 space-y-1">
        <h3 className="text-base font-semibold leading-snug">
          <button type="button" onClick={() => onOpen(item)} className="cursor-pointer text-left after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none">
            {item.label}
          </button>
        </h3>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{text.title}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
        <Badge variant="outline">{TRIGGER_LABEL[item.trigger.type] ?? "Disparador"}</Badge>
        <span>{item.steps.length} {item.steps.length === 1 ? "bloque" : "bloques"}</span>
        <span className="ml-auto flex items-center gap-1.5">
          {run ? (
            <>
              <Badge variant={RUN_STATUS[run.status]?.variant ?? "outline"}>{RUN_STATUS[run.status]?.label ?? run.status}</Badge>
              {relativeTime(run.createdAt)}
            </>
          ) : "Sin ejecuciones"}
        </span>
      </div>
    </li>
  );
}

export default function SystemAutomations() {
  const { session, userProfile } = useAuth();
  const token = session?.access_token;
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const permissions = userProfile?.permissions ?? [];
  const canManage = Boolean(userProfile?.isAdmin || permissions.includes("automations.manage"));
  const canRead = canManage || permissions.includes("automations.read");
  const events = useMemo(() => automationEvents(), []);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [newOpen, setNewOpen] = useState(false);
  const [connectionsOpen, setConnectionsOpen] = useState(false);

  const query = useQuery({
    queryKey: ["system-automations", token],
    queryFn: async () => (await runly.modules.systemAutomations(token))?.data ?? [],
    enabled: Boolean(token) && canRead,
  });
  const items = query.data ?? [];
  const visible = items.filter((item) => (filter === "all" || (filter === "active") === item.enabled) && (!search.trim() || `${item.label} ${item.key}`.toLowerCase().includes(search.trim().toLowerCase())));

  const toggle = useMutation({
    mutationFn: async (item) => {
      const { id: _id, updatedAt: _updatedAt, lastRun: _lastRun, webhookToken: _token, ...definition } = item;
      await runly.modules.saveSystemAutomation(item.key, { ...definition, enabled: !item.enabled }, token);
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["system-automations"] }),
    onError: (error) => toast.error("No se pudo cambiar el estado", { description: error.message }),
  });

  const open = (item) => {
    if (!canManage) { toast.info("Necesitas el permiso para administrar automatizaciones."); return; }
    navigate(`${EDITOR_PATH}/${item.key}`);
  };
  const create = (draft) => { setNewOpen(false); navigate(`${EDITOR_PATH}/nueva`, { state: { draft } }); };

  if (!canRead) {
    return <div className="p-6"><ErrorState title="Sin acceso" description="Necesitas el permiso para ver automatizaciones." /></div>;
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 space-y-6 p-4 md:p-6">
        <PageHeader
          title="Automatizaciones"
          description="Haz que Runly actúe por ti: cuando pasa algo en un módulo, en un horario, o cuando otro sistema te envía datos."
          actions={
            canManage ? (
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" onClick={() => setConnectionsOpen(true)}><Plug className="mr-1.5 h-4 w-4" /> Conexiones</Button>
                <Button onClick={() => setNewOpen(true)}><Plus className="mr-1.5 h-4 w-4" /> Nueva automatización</Button>
              </div>
            ) : null
          }
        />

        {items.length > 0 && (
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-[14rem] max-w-md flex-1">
              <TextField label="Buscar" icon={Search} value={search} placeholder="Nombre de la automatización" onChange={(e) => setSearch(e.target.value)} />
            </div>
            <div role="group" aria-label="Estado" className="inline-flex rounded-md border border-[hsl(var(--border))] p-0.5">
              {FILTERS.map((option) => (
                <button key={option.value} type="button" aria-pressed={filter === option.value} onClick={() => setFilter(option.value)}
                  className={`cursor-pointer rounded-sm px-3 py-1.5 text-sm transition-colors [@media(pointer:coarse)]:min-h-10 ${filter === option.value ? "bg-(--brand-primary)/15 font-medium" : "text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]"}`}>
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {query.isLoading && <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-40 rounded-lg" />)}</div>}
        {query.isError && <ErrorState title="No se pudieron cargar las automatizaciones" description={query.error.message} onRetry={() => query.refetch()} />}
        {query.isSuccess && items.length === 0 && (
          <EmptyState icon={Zap} title="Aún no hay automatizaciones" description="Crea la primera: avisa cuando se apruebe una orden de compra, haz una revisión cada lunes o registra clientes que llegan desde tu tienda."
            action={canManage ? { label: "Nueva automatización", onClick: () => setNewOpen(true) } : undefined} />
        )}
        {query.isSuccess && items.length > 0 && visible.length === 0 && (
          <EmptyState icon={SearchX} title="Sin resultados" description="Ninguna automatización coincide con la búsqueda." />
        )}
        {visible.length > 0 && (
          <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {visible.map((item) => <AutomationCardItem key={item.key} item={item} events={events} onOpen={open} onToggle={(target) => toggle.mutate(target)} toggling={toggle.isPending || !canManage} />)}
          </ul>
        )}

        {items.length > 0 && (
          <section aria-label="Historial">
            <AutomationRunsPanel moduleKey={SYSTEM_MODULE_KEY} published automations={items} />
          </section>
        )}
      </div>
      <NewAutomationDialog open={newOpen} onOpenChange={setNewOpen} takenKeys={new Set(items.map((item) => item.key))} onCreate={create} />
      <AutomationConnectionsDialog open={connectionsOpen} onOpenChange={setConnectionsOpen} />
    </div>
  );
}
