// Full-screen editor of one company automation: top bar (name, active, test,
// history, save) and the canvas below. Opened from the list (/automations/:key)
// or as a new draft (/automations/nueva). Spec
// docs/superpowers/specs/2026-10-25-automation-canvas-and-webhooks-design.md.
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button, ConfirmDialog, ErrorState, Skeleton, Switch, TextField } from "@runly/ui";
import { ArrowLeft, FlaskConical, Plug, Save, Terminal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { automationEvents } from "@runly/module-compiler/browser";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";
import { AutomationConnectionsDialog } from "../../runly.core/components/builder/AutomationConnectionsDialog";
import { AutomationConsole } from "../../runly.core/components/builder/AutomationConsole";
import { AutomationTestDialog } from "../../runly.core/components/builder/AutomationTestDialog";
import { fieldOptionsFor } from "../../runly.core/components/builder/AutomationTrigger";
import { AutomationCanvasEditor } from "../../runly.core/components/builder/canvas/AutomationCanvasEditor";
import { describeAutomationDiagnostic } from "../../runly.core/lib/flowModel";

const LIST_PATH = "/app/m/runly.automations";
const SYSTEM_MODULE_KEY = "system.automations";
const ALLOWED_TRIGGERS = ["event", "schedule", "webhook"];
const NO_ENTITIES = [];

// What the API stores, without the view-only fields.
const toPayload = (item) => {
  const { id: _id, updatedAt: _updatedAt, lastRun: _lastRun, webhookToken: _token, ...definition } = item;
  if (definition.onError === undefined) delete definition.onError;
  if (definition.trigger?.when === undefined) definition.trigger = Object.fromEntries(Object.entries(definition.trigger ?? {}).filter(([name]) => name !== "when"));
  return definition;
};
const snapshot = (item) => JSON.stringify(toPayload(item));

// A new automation only exists on the server after the first save, so its draft is
// kept for this tab: reloading the page must not lose it.
const DRAFT_KEY = "runly.automations.draft";
const readDraft = () => { try { return JSON.parse(sessionStorage.getItem(DRAFT_KEY)); } catch { return null; } };
const writeDraft = (value) => { try { if (value) sessionStorage.setItem(DRAFT_KEY, JSON.stringify(value)); else sessionStorage.removeItem(DRAFT_KEY); } catch { /* storage unavailable */ } };

export default function SystemAutomationEditor() {
  const { "*": wildcard } = useParams();
  const slug = wildcard?.split("/").filter(Boolean).pop() ?? null;
  const isNew = slug === "nueva";
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { session, userProfile } = useAuth();
  const token = session?.access_token;
  const canManage = Boolean(userProfile?.isAdmin || (userProfile?.permissions ?? []).includes("automations.manage"));
  const events = useMemo(() => automationEvents(), []);

  const [item, setItem] = useState(null);
  const [saved, setSaved] = useState(null); // snapshot of what is stored
  const [diagnostics, setDiagnostics] = useState(null);
  const [testOpen, setTestOpen] = useState(false);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [overlayRun, setOverlayRun] = useState(null);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [confirm, setConfirm] = useState(null); // "leave" | "delete"

  const draft = location.state?.draft ?? (isNew ? readDraft() : null);
  const query = useQuery({
    queryKey: ["system-automations", token],
    queryFn: async () => (await runly.modules.systemAutomations(token))?.data ?? [],
    enabled: Boolean(token) && canManage && !isNew,
  });

  useEffect(() => {
    if (isNew) { if (draft && !item) { setItem(draft); setSaved(null); } return; }
    const found = query.data?.find((entry) => entry.key === slug);
    if (found && (!item || item.key !== slug)) { setItem(found); setSaved(snapshot(found)); }
  }, [isNew, draft, query.data, slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const dirty = Boolean(item) && (isNew || snapshot(item) !== saved);
  useEffect(() => { if (isNew && item) writeDraft(item); }, [isNew, item]);
  useEffect(() => {
    if (!dirty) return undefined;
    const warn = (event) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const patch = (changes) => {
    setItem((current) => ({ ...current, ...changes }));
    setDiagnostics(null);
  };

  const save = useMutation({
    mutationFn: async () => {
      const result = isNew
        ? await runly.modules.createSystemAutomation(toPayload(item), token)
        : await runly.modules.saveSystemAutomation(item.key, toPayload(item), token);
      return result.data;
    },
    onSuccess: (data) => {
      toast.success("Automatización guardada");
      queryClient.invalidateQueries({ queryKey: ["system-automations"] });
      writeDraft(null);
      setItem(data);
      setSaved(snapshot(data));
      setDiagnostics(null);
      if (isNew) navigate(`${LIST_PATH}/${data.key}`, { replace: true });
    },
    onError: (error) => {
      setDiagnostics(error.details?.diagnostics ?? [{ message: error.message }]);
      toast.error("No se pudo guardar", { description: error.message });
    },
  });

  const remove = useMutation({
    mutationFn: () => runly.modules.deleteSystemAutomation(item.key, token),
    onSuccess: () => {
      toast.success("Automatización eliminada");
      queryClient.invalidateQueries({ queryKey: ["system-automations"] });
      navigate(LIST_PATH, { replace: true });
    },
    onError: (error) => toast.error("No se pudo eliminar", { description: error.message }),
  });

  const back = () => (dirty ? setConfirm("leave") : navigate(LIST_PATH));

  if (!canManage) return <div className="p-6"><ErrorState title="Sin acceso" description="Necesitas el permiso para administrar automatizaciones." /></div>;
  if (isNew && !draft) return <div className="p-6"><ErrorState title="Nada que editar" description="Empieza una automatización desde la lista." onRetry={() => navigate(LIST_PATH)} /></div>;
  if (!item) {
    if (query.isError) return <div className="p-6"><ErrorState title="No se pudo cargar" description={query.error.message} onRetry={() => query.refetch()} /></div>;
    if (query.isSuccess) return <div className="p-6"><ErrorState title="Automatización no encontrada" description="Puede haberse eliminado." onRetry={() => navigate(LIST_PATH)} /></div>;
    return <div className="p-6"><Skeleton className="h-[30rem] rounded-lg" /></div>;
  }

  const fieldOptions = fieldOptionsFor(item.trigger, NO_ENTITIES, events);
  return (
    <div className="flex h-[calc(100dvh-7.5rem)] min-h-[40rem] flex-col gap-3 p-3 md:p-5">
      <header className="flex flex-wrap items-end gap-2">
        <Button variant="ghost" onClick={back} className="[@media(pointer:coarse)]:h-11"><ArrowLeft className="h-4 w-4 sm:mr-1.5" /> <span className="max-sm:sr-only">Automatizaciones</span></Button>
        <div className="min-w-[12rem] flex-1">
          <TextField aria-label="Nombre de la automatización" value={item.label ?? ""} maxLength={120} onChange={(e) => patch({ label: e.target.value })} />
        </div>
        <label className="flex cursor-pointer items-center gap-2 pb-2 text-sm [@media(pointer:coarse)]:min-h-11">
          Activa <Switch checked={item.enabled !== false} onCheckedChange={(enabled) => patch({ enabled })} aria-label="Activa" />
        </label>
        <div className="flex flex-wrap items-center gap-2 pb-0.5">
          <Button variant="outline" onClick={() => setConnectionsOpen(true)} className="[@media(pointer:coarse)]:h-11"><Plug className="h-4 w-4 sm:mr-1.5" /> <span className="max-sm:sr-only">Conexiones</span></Button>
          <Button variant="outline" onClick={() => setTestOpen(true)} className="[@media(pointer:coarse)]:h-11"><FlaskConical className="h-4 w-4 sm:mr-1.5" /> <span className="max-sm:sr-only">Probar</span></Button>
          {!isNew && <Button variant={consoleOpen ? "secondary" : "outline"} aria-pressed={consoleOpen} onClick={() => setConsoleOpen((open) => !open)} className="[@media(pointer:coarse)]:h-11"><Terminal className="h-4 w-4 sm:mr-1.5" /> <span className="max-sm:sr-only">Consola</span></Button>}
          {!isNew && <Button variant="ghost" aria-label="Eliminar automatización" onClick={() => setConfirm("delete")} className="[@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11"><Trash2 className="h-4 w-4" /></Button>}
          <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()} className="[@media(pointer:coarse)]:h-11"><Save className="mr-1.5 h-4 w-4" /> {save.isPending ? "Guardando..." : dirty ? "Guardar" : "Guardado"}</Button>
        </div>
      </header>

      {diagnostics?.length > 0 && (
        <ul role="alert" className="list-disc space-y-0.5 rounded-md border border-red-500/30 bg-red-500/5 py-2 pl-7 pr-3 text-sm text-red-700 dark:text-red-300">
          {diagnostics.map((entry, index) => <li key={index}>{describeAutomationDiagnostic(entry)}</li>)}
        </ul>
      )}

      <AutomationCanvasEditor
        automation={item} entities={NO_ENTITIES} events={events} allowedTriggers={ALLOWED_TRIGGERS}
        fieldOptions={fieldOptions} readOnly={false} onPatch={patch} className="min-h-0 flex-1" runOverlay={consoleOpen ? overlayRun : null}
      />
      {!isNew && <AutomationConsole moduleKey={SYSTEM_MODULE_KEY} automation={item} open={consoleOpen} onToggle={() => setConsoleOpen((open) => !open)} onSelectRun={setOverlayRun} />}

      <AutomationTestDialog open={testOpen} onOpenChange={setTestOpen} automation={item} fieldOptions={fieldOptions} />
      <AutomationConnectionsDialog open={connectionsOpen} onOpenChange={setConnectionsOpen} />
      <ConfirmDialog
        open={confirm === "leave"} onOpenChange={(open) => !open && setConfirm(null)}
        title="Hay cambios sin guardar" description="Si sales ahora, se pierden los cambios de esta automatización."
        confirmLabel="Salir sin guardar" onConfirm={() => { if (isNew) writeDraft(null); navigate(LIST_PATH); }}
      />
      <ConfirmDialog
        open={confirm === "delete"} onOpenChange={(open) => !open && setConfirm(null)}
        title="Eliminar automatización" description="Dejará de ejecutarse. Lo que ya creó en otros módulos se conserva."
        confirmLabel="Eliminar" onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
