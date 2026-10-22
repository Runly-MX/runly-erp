import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@runly/ui";
import { Banknote } from "lucide-react";
import { ChartTooltip, Panel } from "../../../runly.inventory/components/dashboard/dashboard-theme.jsx";
import { REPORT_TYPE_LABELS, formatMonth } from "../../lib/fleet-status.js";

const money = new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN", maximumFractionDigits: 0 });
const compact = new Intl.NumberFormat("es-MX", { notation: "compact", maximumFractionDigits: 1 });

// Monthly spend (bars) against the number of reports (line), plus the split
// by report type and the units that cost the most.
export function SpendPanel({ reports, topCostVehicles, onOpenVehicle }) {
  const rows = reports.monthly.map((m) => ({ ...m, label: formatMonth(m.month) }));
  const hasData = rows.some((m) => m.count > 0);
  const maxType = Math.max(1, ...reports.byType.map((t) => t.cost));

  return (
    <Panel title="Gasto y reportes" subtitle={`${money.format(reports.totalCost)} en el periodo`} icon={Banknote} tone="#0ea5e9">
      {!hasData ? (
        <EmptyState icon={Banknote} title="Sin reportes todavía" description="Cuando registres mantenimientos, servicios o reparaciones verás aquí el gasto mensual." />
      ) : (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
          <div className="h-64 min-w-0" role="img" aria-label="Gasto mensual y numero de reportes">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
              <ComposedChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} interval="preserveStartEnd" />
                <YAxis yAxisId="cost" tickLine={false} axisLine={false} width={48} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} tickFormatter={(v) => compact.format(v)} />
                <YAxis yAxisId="count" orientation="right" hide allowDecimals={false} />
                <Tooltip content={<ChartTooltip formatter={(v, p) => (p.dataKey === "cost" ? money.format(v) : v)} />} />
                <Bar yAxisId="cost" dataKey="cost" name="Gasto" fill="var(--viz-1)" radius={[6, 6, 0, 0]} maxBarSize={36} />
                <Line yAxisId="count" dataKey="count" name="Reportes" stroke="var(--viz-2)" strokeWidth={2} dot={{ r: 3 }} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          <div className="min-w-0 space-y-5">
            <div>
              <h4 className="mb-2 text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Por tipo</h4>
              <ul className="space-y-2">
                {reports.byType.map((t) => (
                  <li key={t.type} className="text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate">{REPORT_TYPE_LABELS[t.type] ?? t.type}</span>
                      <span className="shrink-0 tabular-nums text-[hsl(var(--muted-foreground))]">{t.count} · {money.format(t.cost)}</span>
                    </div>
                    <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-[hsl(var(--muted))]">
                      <span className="block h-full rounded-full" style={{ width: `${(t.cost / maxType) * 100}%`, backgroundColor: "var(--viz-1)" }} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            {topCostVehicles.length ? (
              <div>
                <h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Unidades que más gastan</h4>
                <ul>
                  {topCostVehicles.map((v) => (
                    <li key={v.vehicleId}>
                      <button
                        type="button" onClick={() => onOpenVehicle(v.vehicleId)}
                        className="flex min-h-11 w-full items-center justify-between gap-2 rounded-lg px-2 text-left text-sm hover:bg-[hsl(var(--muted))]/50"
                      >
                        <span className="truncate font-medium">{v.plate}</span>
                        <span className="shrink-0 tabular-nums text-[hsl(var(--muted-foreground))]">{money.format(v.cost)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </Panel>
  );
}
