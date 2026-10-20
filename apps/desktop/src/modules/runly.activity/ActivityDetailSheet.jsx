import {
  Badge,
  Button,
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@runly/ui";
import { ArrowRight, ExternalLink } from "lucide-react";
import { ActivityModuleBadge } from "./ActivityModuleBadge";

const SEVERITY_VARIANT = {
  info: "secondary",
  success: "success",
  warning: "warning",
  critical: "destructive",
};

const SEVERITY_LABEL = {
  info: "Info",
  success: "Éxito",
  warning: "Advertencia",
  critical: "Crítico",
};

function formatDate(value) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleString("es-MX", {
      dateStyle: "long",
      timeStyle: "medium",
    });
  } catch {
    return String(value);
  }
}

function getActorName(actor) {
  if (!actor) return "Sistema";
  return (
    actor.displayName ||
    [actor.firstName, actor.lastName].filter(Boolean).join(" ").trim() ||
    "Sistema"
  );
}

// "assetTag" -> "Asset tag" when the module has no curated label.
function humanizeField(name) {
  const spaced = String(name ?? "").replace(/[_.]+/g, " ").replace(/([a-z])([A-Z])/g, "$1 $2").trim().toLowerCase();
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function formatValue(value) {
  if (value === null || value === undefined || value === "") return "vacío";
  if (typeof value === "boolean") return value ? "Sí" : "No";
  return String(value);
}

function ChangesList({ changes }) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {changes.map((change, index) => (
        <li key={`${change.field}-${index}`} className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[10rem_1fr]">
          <span className="text-muted-foreground">{humanizeField(change.field)}</span>
          <span className="flex min-w-0 flex-wrap items-center gap-1.5 break-words">
            {change.oldValue !== null && change.oldValue !== undefined && change.oldValue !== "" ? (
              <>
                <span className="text-muted-foreground line-through">{formatValue(change.oldValue)}</span>
                <ArrowRight size={12} className="shrink-0 text-muted-foreground" />
              </>
            ) : null}
            <span className="font-medium">{formatValue(change.newValue)}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

const PROBLEM_LABEL = { error: "Error", warning: "Advertencia" };

function ProblemsList({ problems }) {
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {problems.map((problem, index) => (
        <li key={`${problem.line}-${index}`} className="px-3 py-2 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={problem.status === "error" ? "destructive" : "warning"}>{PROBLEM_LABEL[problem.status] ?? problem.status}</Badge>
            <span className="text-muted-foreground">Fila {problem.line}</span>
            {problem.name ? <span className="font-medium">{problem.name}</span> : null}
          </div>
          {problem.message ? <p className="mt-1 text-muted-foreground">{problem.message}</p> : null}
        </li>
      ))}
    </ul>
  );
}

function Field({ label, children }) {
  return (
    <div className="space-y-1">
      <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>
      <div className="text-sm text-foreground break-words">{children}</div>
    </div>
  );
}

export default function ActivityDetailSheet({ activity, onClose, onNavigate }) {
  const open = Boolean(activity);
  const payload = activity?.payload && typeof activity.payload === "object" ? activity.payload : null;
  const changes = Array.isArray(payload?.changes) ? payload.changes : [];
  const problems = Array.isArray(payload?.problems) ? payload.problems : [];
  const { changes: _changes, problems: _problems, ...others } = payload ?? {};
  const rest = Object.keys(others).length > 0 ? others : null;

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose?.()}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Detalle del evento</SheetTitle>
          <SheetDescription>
            Qué pasó, quién lo hizo y qué datos cambiaron.
          </SheetDescription>
        </SheetHeader>

        {activity && (
          <div className="mt-4 space-y-5">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge
                variant={SEVERITY_VARIANT[activity.severity] ?? "secondary"}
              >
                {SEVERITY_LABEL[activity.severity] ??
                  activity.severity ??
                  "Info"}
              </Badge>
              <ActivityModuleBadge type={activity.type} />
            </div>

            <Field label="Resumen">
              <p className="leading-relaxed">{activity.summary ?? "—"}</p>
            </Field>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Usuario">{getActorName(activity.actor)}</Field>
              <Field label="Fecha">{formatDate(activity.createdAt)}</Field>
              <Field label="Evento">
                <code className="text-xs">{activity.type ?? "—"}</code>
              </Field>
              <Field label="Entidad">
                {activity.entityType ?? "—"}
                {activity.entityId ? <code className="ml-2 text-xs text-muted-foreground">{activity.entityId}</code> : null}
              </Field>
            </div>

            {activity.link && (
              <Field label="Enlace">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => onNavigate?.(activity.link)}
                >
                  <ExternalLink size={14} />
                  Abrir entidad
                </Button>
              </Field>
            )}

            {changes.length > 0 && (
              <Field label={`Valores y cambios (${changes.length})`}>
                <ChangesList changes={changes} />
              </Field>
            )}

            {problems.length > 0 && (
              <Field label={`Filas con problemas (${problems.length})`}>
                <ProblemsList problems={problems} />
              </Field>
            )}

            {rest ? (
              <Field label="Otros datos">
                <details>
                  <summary className="cursor-pointer text-xs text-muted-foreground">Ver datos técnicos</summary>
                  <pre className="mt-2 text-xs bg-muted/40 border border-border rounded-lg p-3 overflow-x-auto max-h-72">
                    {JSON.stringify(rest, null, 2)}
                  </pre>
                </details>
              </Field>
            ) : null}

            {!changes.length && !problems.length && !rest ? (
              <p className="text-xs text-muted-foreground italic">
                Este evento no guardó detalles adicionales; el resumen describe lo ocurrido.
              </p>
            ) : null}

            <Field label="ID del evento">
              <code className="text-xs">{activity.id}</code>
            </Field>
          </div>
        )}

        <SheetFooter className="mt-6">
          <SheetClose asChild>
            <Button variant="outline" size="sm">
              Cerrar
            </Button>
          </SheetClose>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
