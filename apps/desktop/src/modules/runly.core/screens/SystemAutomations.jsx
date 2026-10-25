// Runly Core > Automatizaciones: automations of the company that are not tied to
// a module. Same cards, steps, Probar and Historial as the Module Builder, but
// triggered by a system event or a schedule (spec
// docs/superpowers/specs/2026-10-25-system-automations-design.md).
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, ConfirmDialog, EmptyState, ErrorState, PageHeader, Skeleton } from "@runly/ui";
import { Globe, Plus, Save, Zap } from "lucide-react";
import { toast } from "sonner";
import { MAX_AUTOMATIONS, automationEvents } from "@runly/module-compiler/browser";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";
import { AutomationCard } from "../components/builder/AutomationCard";
import { AutomationHostsDialog } from "../components/builder/AutomationHostsDialog";
import { AutomationRunsPanel } from "../components/builder/AutomationRunsPanel";

const SYSTEM_MODULE_KEY = "system.automations";
const ALLOWED_TRIGGERS = ["event", "schedule"];
const NO_ENTITIES = [];

function newDraft(taken, firstEvent) {
  let index = taken.size + 1;
  while (taken.has(`automatizacion_${index}`)) index += 1;
  return {
    key: `automatizacion_${index}`,
    label: "Nueva automatización",
    enabled: true,
    trigger: { type: "event", event: firstEvent },
    steps: [{ service: "", args: {} }],
  };
}

// What the API stores, without the view-only fields.
const toPayload = (item) => {
  const { id: _id, updatedAt: _updatedAt, ...definition } = item;
  return definition;
};

function Diagnostics({ items }) {
  if (!items?.length) return null;
  return (
    <ul className="list-disc space-y-0.5 pl-5 text-xs text-red-600 dark:text-red-400">
      {items.map((item, index) => <li key={index}>{item.message ?? String(item)}</li>)}
    </ul>
  );
}

export default function SystemAutomations() {
  const { session, userProfile } = useAuth();
  const token = session?.access_token;
  const queryClient = useQueryClient();
  const canManage = Boolean(userProfile?.isAdmin || (userProfile?.permissions ?? []).includes("core.modules.manage"));
  const events = useMemo(() => automationEvents(), []);
  const [items, setItems] = useState([]);
  const [meta, setMeta] = useState({});
  const [removeKey, setRemoveKey] = useState(null);
  const [hostsOpen, setHostsOpen] = useState(false);

  const query = useQuery({
    queryKey: ["system-automations", token],
    queryFn: async () => (await runly.modules.systemAutomations(token))?.data ?? [],
    enabled: Boolean(token) && canManage,
  });
  useEffect(() => {
    if (query.data) {
      setItems(query.data);
      setMeta({});
    }
  }, [query.data]);

  const patch = (key, changes) => {
    setItems((list) => list.map((item) => {
      if (item.key !== key) return item;
      const next = { ...item, ...changes };
      if (next.onError === undefined) delete next.onError;
      if (next.trigger?.when === undefined) next.trigger = Object.fromEntries(Object.entries(next.trigger ?? {}).filter(([name]) => name !== "when"));
      return next;
    }));
    setMeta((current) => ({ ...current, [key]: { ...current[key], dirty: true, diagnostics: null } }));
  };

  const save = useMutation({
    mutationFn: async (item) => {
      const isNew = meta[item.key]?.isNew;
      const result = isNew
        ? await runly.modules.createSystemAutomation(toPayload(item), token)
        : await runly.modules.saveSystemAutomation(item.key, toPayload(item), token);
      return result.data;
    },
    onSuccess: (saved) => {
      toast.success("Automatización guardada");
      setItems((list) => list.map((item) => (item.key === saved.key ? saved : item)));
      setMeta((current) => ({ ...current, [saved.key]: {} }));
      queryClient.invalidateQueries({ queryKey: ["system-automations"] });
    },
    onError: (error, item) => {
      setMeta((current) => ({ ...current, [item.key]: { ...current[item.key], diagnostics: error.details?.diagnostics ?? [{ message: error.message }] } }));
      toast.error("No se pudo guardar", { description: error.message });
    },
  });

  const remove = useMutation({
    mutationFn: async (key) => {
      if (!meta[key]?.isNew) await runly.modules.deleteSystemAutomation(key, token);
    },
    onSuccess: (_data, key) => {
      toast.success("Automatización eliminada");
      setItems((list) => list.filter((item) => item.key !== key));
      setRemoveKey(null);
      queryClient.invalidateQueries({ queryKey: ["system-automations"] });
    },
    onError: (error) => toast.error("No se pudo eliminar", { description: error.message }),
  });

  const add = () => {
    const draft = newDraft(new Set(items.map((item) => item.key)), events[0]?.key);
    setItems((list) => [...list, draft]);
    setMeta((current) => ({ ...current, [draft.key]: { isNew: true, dirty: true } }));
  };

  if (!canManage) {
    return <div className="p-6"><ErrorState title="Sin acceso" description="Necesitas el permiso para administrar módulos." /></div>;
  }

  return (
    <div className="flex min-h-full flex-col">
      <div className="flex-1 space-y-5 p-4 md:p-6">
        <PageHeader
          eyebrow="Runly Core"
          title="Automatizaciones"
          description="Haz que Runly actúe por ti: cuando pasa algo en un módulo (una orden de compra aprobada, un colaborador nuevo, una tarea completada) o en un horario, ejecuta pasos en otros módulos, espera, pide una aprobación o llama a un servidor externo."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <Button variant="outline" onClick={() => setHostsOpen(true)}><Globe className="mr-1 h-4 w-4" /> Destinos permitidos</Button>
              <Button onClick={add} disabled={items.length >= MAX_AUTOMATIONS * 2}><Plus className="mr-1 h-4 w-4" /> Nueva automatización</Button>
            </div>
          }
        />

        {query.isLoading && <Skeleton className="h-48 rounded-xl" />}
        {query.isError && <ErrorState title="No se pudieron cargar las automatizaciones" description={query.error.message} onRetry={() => query.refetch()} />}
        {query.isSuccess && items.length === 0 && (
          <EmptyState icon={Zap} title="Sin automatizaciones" description="Crea una para que Runly notifique, cree tareas o registre información cuando ocurra algo en tu empresa." />
        )}

        {items.map((item) => {
          const state = meta[item.key] ?? {};
          return (
            <div key={item.key} className="space-y-2">
              <AutomationCard
                automation={item}
                entities={NO_ENTITIES}
                events={events}
                allowedTriggers={ALLOWED_TRIGGERS}
                readOnly={false}
                onPatch={(changes) => patch(item.key, changes)}
                onRemove={() => (state.isNew ? remove.mutate(item.key) : setRemoveKey(item.key))}
              />
              <Diagnostics items={state.diagnostics} />
              {state.dirty && (
                <div className="flex justify-end">
                  <Button disabled={save.isPending} onClick={() => save.mutate(item)}>
                    <Save className="mr-1 h-4 w-4" /> {save.isPending ? "Guardando..." : "Guardar"}
                  </Button>
                </div>
              )}
            </div>
          );
        })}

        <AutomationRunsPanel moduleKey={SYSTEM_MODULE_KEY} published automations={items} />
      </div>
      <AutomationHostsDialog open={hostsOpen} onOpenChange={setHostsOpen} />
      <ConfirmDialog
        open={removeKey !== null}
        onOpenChange={(open) => !open && setRemoveKey(null)}
        title="Eliminar automatización"
        description="Dejará de ejecutarse. Lo que ya creó en otros módulos se conserva."
        confirmLabel="Eliminar"
        onConfirm={() => remove.mutate(removeKey)}
      />
    </div>
  );
}
