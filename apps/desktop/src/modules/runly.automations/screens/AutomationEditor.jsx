// Full-screen editor of one company automation: top bar (name, active, test,
// history, save) and the canvas below. Opened from the list (/automations/:key)
// or as a new draft (/automations/nueva). Spec
// docs/superpowers/specs/2026-10-25-automation-canvas-and-webhooks-design.md.
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ActionMenu, Button, ConfirmDialog, ErrorState, Skeleton, Switch, Tooltip, TooltipContent, TooltipTrigger, cn, useViewMode } from "@runly/ui";
import { ArrowLeft, Check, FlaskConical, Fullscreen, Loader2, Maximize2, Minimize2, Plug, Save, Terminal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { automationEvents } from "@runly/module-compiler/browser";
import { useAuth } from "../../../auth/AuthProvider";
import { runly } from "../../../lib/runly";
import { useMiraiRecordContext } from "../../runly.chat/lib/miraiPageContext.js";
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

const VIEW_LABELS = { normal: "Vista despejada", clean: "Pantalla completa", fullscreen: "Vista normal (Esc)" };

function BarButton({ label, active = false, className, children, ...props }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button" variant="ghost" size="icon" aria-label={label} aria-pressed={active || undefined}
          className={cn("h-9 w-9 text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))] [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11", active && "bg-(--brand-primary)/15 text-[hsl(var(--foreground))]", className)}
          {...props}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}

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
  const viewMode = useViewMode();
  const stepBackView = viewMode.stepBack;
  useEffect(() => {
    const onKey = (event) => { if (event.key === "Escape" && !event.defaultPrevented) stepBackView(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stepBackView]);

  useMiraiRecordContext({ recordType: "automation", recordId: isNew ? undefined : slug, label: item?.label });

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
  const immersive = viewMode.isImmersive;
  return (
    <div className={cn("flex min-h-0 flex-col bg-[hsl(var(--background))]", immersive ? "fixed inset-0 z-50 h-dvh" : "h-full min-h-[34rem]")}>
      <header className="flex shrink-0 flex-wrap items-center gap-x-1.5 gap-y-1 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 py-1.5 sm:px-3">
        <BarButton label="Volver a Automatizaciones" onClick={back}><ArrowLeft className="h-4 w-4" /></BarButton>
        <input
          aria-label="Nombre de la automatización" value={item.label ?? ""} maxLength={120} onChange={(e) => patch({ label: e.target.value })}
          className="h-9 min-w-[8rem] max-w-md flex-1 rounded-md border border-transparent bg-transparent px-2 text-base font-semibold outline-none transition-colors hover:border-[hsl(var(--border))] focus:border-(--brand-primary) [@media(pointer:coarse)]:h-11"
        />
        <span role="status" aria-live="polite" className="hidden items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))] md:inline-flex">
          {save.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : dirty ? <span className="h-2 w-2 rounded-full bg-amber-500" /> : <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />}
          {save.isPending ? "Guardando…" : dirty ? "Sin guardar" : "Guardado"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          <label className="mr-1 flex cursor-pointer items-center gap-2 rounded-md px-2 text-sm [@media(pointer:coarse)]:min-h-11">
            <Switch checked={item.enabled !== false} onCheckedChange={(enabled) => patch({ enabled })} aria-label="Activa" />
            <span className="max-sm:sr-only">{item.enabled !== false ? "Activa" : "En pausa"}</span>
          </label>
          <BarButton label="Conexiones" onClick={() => setConnectionsOpen(true)}><Plug className="h-4 w-4" /></BarButton>
          {!isNew && <BarButton label={consoleOpen ? "Ocultar la consola" : "Consola de ejecución"} active={consoleOpen} onClick={() => setConsoleOpen((open) => !open)}><Terminal className="h-4 w-4" /></BarButton>}
          <Button variant="outline" onClick={() => setTestOpen(true)} className="h-9 gap-1.5 [@media(pointer:coarse)]:h-11"><FlaskConical className="h-4 w-4" /> <span className="max-sm:sr-only">Probar</span></Button>
          <BarButton label={VIEW_LABELS[viewMode.mode]} onClick={viewMode.cycle} className="max-sm:hidden">
            {viewMode.mode === "normal" ? <Maximize2 className="h-4 w-4" /> : viewMode.mode === "clean" ? <Fullscreen className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </BarButton>
          {!isNew && <ActionMenu label="Más opciones" items={[{ label: "Eliminar automatización", icon: Trash2, variant: "destructive", onClick: () => setConfirm("delete") }]} />}
          <Button disabled={!dirty || save.isPending} onClick={() => save.mutate()} className="h-9 gap-1.5 [@media(pointer:coarse)]:h-11"><Save className="h-4 w-4" /> <span className="max-sm:sr-only">{save.isPending ? "Guardando..." : "Guardar"}</span></Button>
        </div>
      </header>

      {diagnostics?.length > 0 && (
        <ul role="alert" className="mx-3 mt-2 list-disc space-y-0.5 rounded-md border border-red-500/30 bg-red-500/5 py-2 pl-7 pr-3 text-sm text-red-700 dark:text-red-300">
          {diagnostics.map((entry, index) => <li key={index}>{describeAutomationDiagnostic(entry)}</li>)}
        </ul>
      )}

      <AutomationCanvasEditor
        automation={item} entities={NO_ENTITIES} events={events} allowedTriggers={ALLOWED_TRIGGERS}
        fieldOptions={fieldOptions} readOnly={false} onPatch={patch} className="m-2 min-h-0 flex-1 sm:m-3" runOverlay={consoleOpen ? overlayRun : null}
      />
      {!isNew && <div className="mx-2 mb-2 shrink-0 sm:mx-3 sm:mb-3"><AutomationConsole moduleKey={SYSTEM_MODULE_KEY} automation={item} open={consoleOpen} onToggle={() => setConsoleOpen((open) => !open)} onSelectRun={setOverlayRun} /></div>}

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
