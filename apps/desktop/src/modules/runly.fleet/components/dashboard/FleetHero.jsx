import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { Skeleton } from "@runly/ui";
import { ChartTooltip } from "../../../runly.inventory/components/dashboard/dashboard-theme.jsx";
import { VEHICLE_STATUSES } from "../../lib/fleet-status.js";

// The one loud element of the page: status donut with the fleet total in the
// middle and a tile per operational status.
export function FleetHero({ data, isLoading, onSelect }) {
  const total = data?.totals.vehicles ?? 0;
  const slices = VEHICLE_STATUSES.map((s) => ({ ...s, count: data?.totals[s.value] ?? 0 }));
  const pie = slices.filter((s) => s.count > 0);
  const availability = total ? Math.round(((data?.totals.active ?? 0) / total) * 100) : 0;

  return (
    <section
      className="relative overflow-hidden rounded-3xl p-5 text-white shadow-xl sm:p-6 md:p-8"
      style={{ background: "linear-gradient(135deg, #0f766e 0%, #0e7490 55%, #1e3a8a 100%)" }}
    >
      <div aria-hidden className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-emerald-300/25 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-28 left-1/3 h-72 w-72 rounded-full bg-sky-400/25 blur-3xl" />

      <div className="relative grid items-center gap-6 md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-8">
        <div className="relative mx-auto h-48 w-48 md:h-56 md:w-56">
          {isLoading ? (
            <Skeleton className="h-full w-full rounded-full bg-white/15" />
          ) : (
            <>
              <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
                <PieChart>
                  <Pie
                    data={pie.length ? pie : [{ label: "Sin vehículos", count: 1, color: "rgba(255,255,255,0.18)" }]}
                    dataKey="count" nameKey="label" innerRadius="72%" outerRadius="100%"
                    paddingAngle={pie.length > 1 ? 3 : 0} cornerRadius={6} stroke="none"
                  >
                    {(pie.length ? pie : [{ color: "rgba(255,255,255,0.18)" }]).map((s, i) => <Cell key={i} fill={s.color} />)}
                  </Pie>
                  {pie.length ? <Tooltip content={<ChartTooltip />} /> : null}
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <span className="text-5xl font-bold tabular-nums tracking-tight">{total}</span>
                <span className="text-sm text-white/75">vehículos</span>
              </div>
            </>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight md:text-3xl">Tu flota hoy</h2>
            <p className="mt-1 max-w-xl text-sm text-white/80">
              {isLoading
                ? "Cargando..."
                : `${availability}% de la flota está disponible, con ${data?.totals.driversActive ?? 0} choferes activos y ${data?.totals.financed ?? 0} unidades financiadas.`}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {slices.map((s) => {
              const pct = total ? Math.round((s.count / total) * 100) : 0;
              return (
                <button
                  key={s.value} type="button" onClick={() => onSelect?.(s.value)}
                  className="rounded-2xl border border-white/15 bg-white/10 p-3 text-left backdrop-blur-md transition-colors hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                >
                  <span className="flex items-center gap-2 text-xs text-white/85">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full ring-2 ring-white/40" style={{ backgroundColor: s.color }} />
                    <span className="truncate">{s.label}</span>
                  </span>
                  <span className="mt-1 flex items-baseline gap-1.5">
                    {isLoading ? <Skeleton className="h-7 w-10 bg-white/20" /> : <span className="text-2xl font-semibold tabular-nums">{s.count}</span>}
                    <span className="text-xs tabular-nums text-white/70">{pct}%</span>
                  </span>
                  <span className="mt-2 block h-1 overflow-hidden rounded-full bg-white/15">
                    <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: s.color }} />
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
