import { useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Badge, EmptyState, Skeleton } from "@runly/ui";
import { Activity, AlertTriangle, CheckCircle2, SearchX, Wrench, XCircle } from "lucide-react";

import { runly } from "../../../lib/runly.js";
import { ThemeToggle } from "../../../components/ThemeToggle.jsx";
import { PUBLIC_PAGE_CLASS } from "../../runly.lms/public/keyboardSafeFocus.js";

const MUTED = "text-[hsl(var(--muted-foreground))]";

const OVERALL = {
  operational: { icon: CheckCircle2, label: "Todos los sistemas funcionan", tone: "border-emerald-600/30 bg-emerald-600/10" },
  degraded: { icon: AlertTriangle, label: "Algunos servicios tienen problemas", tone: "border-amber-600/40 bg-amber-600/10" },
  outage: { icon: XCircle, label: "Hay servicios sin funcionar", tone: "border-[hsl(var(--destructive)/0.35)] bg-[hsl(var(--destructive)/0.08)]" },
  maintenance: { icon: Wrench, label: "Mantenimiento en curso", tone: "border-[hsl(var(--border))] bg-[hsl(var(--muted))]" },
  unknown: { icon: Activity, label: "Aun no hay datos suficientes", tone: "border-[hsl(var(--border))] bg-[hsl(var(--muted))]" },
};
const ROW = {
  operational: { label: "Operativo", variant: "success" },
  degraded: { label: "Con problemas", variant: "warning" },
  outage: { label: "Sin servicio", variant: "destructive" },
  maintenance: { label: "Mantenimiento", variant: "secondary" },
  unknown: { label: "Sin datos", variant: "secondary" },
};

const formatDate = (value) => new Date(value).toLocaleString("es-MX", { dateStyle: "medium", timeStyle: "short" });

function duration(minutes) {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return `${hours} h ${minutes % 60} min`;
}

// Anonymous status page of a Growth site, rendered inside PublicShell at /app/p/status/:slug.
export default function StatusPageScreen() {
  const { slug } = useParams();
  const query = useQuery({
    queryKey: ["public-growth-status", slug],
    queryFn: async () => (await runly.growth.getPublicStatusPage(slug))?.data,
    enabled: Boolean(slug),
    retry: false,
    refetchInterval: 60_000,
  });
  const data = query.data;
  const overall = OVERALL[data?.overall] ?? OVERALL.unknown;
  const OverallIcon = overall.icon;

  return (
    <div className={PUBLIC_PAGE_CLASS}>
      <header className="mx-auto flex max-w-2xl items-center justify-between gap-3 px-4 py-4">
        <h1 className="min-w-0 truncate text-lg font-semibold">{data?.title ?? "Estado del servicio"}</h1>
        <ThemeToggle />
      </header>
      <main className="mx-auto flex max-w-2xl flex-col gap-6 px-4 pb-10">
        {query.isError ? (
          <EmptyState icon={SearchX} title="Pagina no disponible" description="El enlace no existe o la pagina de estado ya no esta publicada." />
        ) : query.isPending || !data ? (
          <>
            <Skeleton className="h-16 w-full rounded-md" />
            <Skeleton className="h-40 w-full rounded-md" />
          </>
        ) : (
          <>
            <div role="status" className={`flex items-center gap-3 rounded-md border p-4 ${overall.tone}`}>
              <OverallIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <p className="font-medium">{overall.label}</p>
            </div>

            <section aria-label="Servicios" className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
              {data.monitors.length === 0 ? (
                <p className={`p-4 text-sm ${MUTED}`}>Aun no hay servicios monitoreados.</p>
              ) : data.monitors.map((monitor) => (
                <div key={monitor.name} className="flex items-center justify-between gap-3 p-3 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{monitor.name}</p>
                    <p className={`text-xs ${MUTED}`}>
                      {monitor.kind}{monitor.uptime30d != null ? ` - ${monitor.uptime30d}% disponible en 30 dias` : ""}
                    </p>
                  </div>
                  <Badge variant={(ROW[monitor.status] ?? ROW.unknown).variant}>{(ROW[monitor.status] ?? ROW.unknown).label}</Badge>
                </div>
              ))}
            </section>

            <section aria-label="Incidentes recientes" className="space-y-2">
              <h2 className="text-base font-semibold">Incidentes de los ultimos 30 dias</h2>
              {data.incidents.length === 0 ? (
                <p className={`text-sm ${MUTED}`}>Sin incidentes en este periodo.</p>
              ) : (
                <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
                  {data.incidents.map((incident) => (
                    <li key={`${incident.monitorName}-${incident.startedAt}`} className="p-3 text-sm">
                      <p className="font-medium">{incident.monitorName}</p>
                      <p className={`text-xs ${MUTED}`}>
                        {formatDate(incident.startedAt)} - {incident.resolvedAt ? `resuelto, duro ${duration(incident.minutes)}` : "en curso"}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <p className={`text-center text-xs ${MUTED}`}>Actualizado: {formatDate(data.updatedAt)} (se renueva cada minuto)</p>
          </>
        )}
      </main>
    </div>
  );
}
