import { useNavigate } from "react-router-dom";
import { Skeleton, cn } from "@runly/ui";
import {
  CalendarClock, ChevronRight, CircleCheck, IdCard, ShieldAlert, ShieldCheck, ShieldOff,
  Sparkles, TrendingUp, TriangleAlert, UserX, Wrench,
} from "lucide-react";
import { Panel } from "../../../runly.inventory/components/dashboard/dashboard-theme.jsx";

const ICONS = { Wrench, CalendarClock, TriangleAlert, TrendingUp, ShieldAlert, ShieldCheck, ShieldOff, IdCard, UserX, CircleCheck };

const SEVERITY = {
  critical: { label: "Urgente", dot: "bg-red-500", chip: "bg-red-500/12 text-red-600 dark:text-red-400", icon: "text-red-500" },
  warning: { label: "Atención", dot: "bg-amber-500", chip: "bg-amber-500/15 text-amber-700 dark:text-amber-400", icon: "text-amber-500" },
  info: { label: "Aviso", dot: "bg-sky-500", chip: "bg-sky-500/12 text-sky-700 dark:text-sky-400", icon: "text-sky-500" },
};

// Ranked alerts computed from reports, expirations and assignments: what the
// fleet needs next, most urgent first.
export function InsightsPanel({ insights, isLoading }) {
  const navigate = useNavigate();
  const urgent = insights?.filter((i) => i.severity === "critical").length ?? 0;

  return (
    <Panel
      title="Alertas inteligentes"
      subtitle={isLoading ? "Analizando la flota..." : urgent ? `${urgent} urgentes` : "Nada urgente por ahora"}
      icon={Sparkles}
      tone="#0d9488"
    >
      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
      ) : (
        <ul className="grid gap-2 lg:grid-cols-2">
          {insights.map((item) => {
            const tone = SEVERITY[item.severity] ?? SEVERITY.info;
            const Icon = ICONS[item.icon] ?? Sparkles;
            const Tag = item.href ? "button" : "div";
            return (
              <li key={item.id} className="min-w-0">
                <Tag
                  type={item.href ? "button" : undefined}
                  onClick={item.href ? () => navigate(item.href) : undefined}
                  className={cn(
                    "flex min-h-14 w-full items-start gap-3 rounded-xl bg-[hsl(var(--muted))]/35 p-3 text-left",
                    item.href && "transition-colors hover:bg-[hsl(var(--muted))]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]",
                  )}
                >
                  <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", tone.icon)} aria-hidden />
                  <span className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-[hsl(var(--foreground))]">{item.title}</span>
                      <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium", tone.chip)}>{tone.label}</span>
                    </span>
                    {item.detail ? <span className="mt-0.5 block text-xs text-[hsl(var(--muted-foreground))]">{item.detail}</span> : null}
                  </span>
                  {item.href ? <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden /> : null}
                </Tag>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
