import { runly } from "../../../lib/runly";
import { WidgetFrame, unwrap, useWidgetQuery } from "./WidgetFrame";

function Stat({ label, value, note, tone }) {
  const noteClass = tone === "bad" ? "text-red-600 dark:text-red-400" : "text-amber-600 dark:text-amber-400";
  return (
    <div className="rounded-xl bg-[hsl(var(--muted))]/60 px-3 py-2">
      <p className="text-xl font-bold tabular-nums leading-none text-[hsl(var(--foreground))]">{value}</p>
      <p className="mt-1 text-xs leading-tight text-[hsl(var(--muted-foreground))]">{label}</p>
      {note && <p className={`text-[11px] font-medium ${noteClass}`}>{note}</p>}
    </div>
  );
}

export function AttendanceWidget({ module }) {
  const query = useWidgetQuery(["attendance-summary"], (token) => runly.attendance.getSummary(token));
  const d = unwrap(query.data) ?? {};
  const failing = d.quotas?.failing ?? 0;
  const flagged = d.flaggedLast7d ?? 0;

  return (
    <WidgetFrame
      module={module}
      title="Asistencia"
      subtitle={`${d.people ?? 0} personas activas`}
      query={query}
      isEmpty={!d.people}
      emptyText="Aún no hay personal registrado en Asistencia."
    >
      <div className="grid grid-cols-2 gap-2">
        <Stat label="Presentes ahora" value={d.present?.total ?? 0} />
        <Stat label="Cuotas en incumplimiento" value={failing} note={failing ? "Faltan elementos" : null} tone="bad" />
        <Stat label="Checadas por revisar (7 días)" value={flagged} note={flagged ? "Revisar marcas" : null} />
        <Stat label="Cuotas configuradas" value={d.quotas?.total ?? 0} />
      </div>
    </WidgetFrame>
  );
}
