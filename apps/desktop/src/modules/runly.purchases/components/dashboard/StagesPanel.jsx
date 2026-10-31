import { Link } from 'react-router-dom'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import { EmptyState } from '@runly/ui'
import { Workflow } from 'lucide-react'
import { ChartTooltip, Panel } from './dashboard-theme.jsx'
import { ROOT, TONES } from '../../lib/purchases-constants.js'

const PALETTE = [TONES.teal, TONES.sky, TONES.violet, TONES.amber, TONES.emerald, TONES.petrol, TONES.slate]

// Documents in each active stage of the flow: a ring with the total in the
// middle and a legend whose rows open the filtered list.
// items: stageItems() rows ({ key, label, value, to }).
export function StagesPanel({ items = [], className }) {
  // Colors follow the stage, then empty stages drop out of the legend.
  const rows = items.map((item, i) => ({ ...item, count: Number(item.value) || 0, color: PALETTE[i % PALETTE.length] })).filter((r) => r.count)
  const total = rows.reduce((acc, r) => acc + r.count, 0)
  return (
    <Panel title="En proceso" subtitle="Documentos en cada etapa del flujo" icon={Workflow} tone={TONES.violet} className={className}>
      {!total ? <EmptyState variant="compact" icon={Workflow} title="Nada en proceso" description="Las solicitudes, órdenes y facturas abiertas aparecen aquí." /> : (
        <div className="flex flex-col items-center gap-4 sm:flex-row xl:flex-col 2xl:flex-row">
          <div className="relative h-40 w-40 shrink-0">
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={{ width: 1, height: 1 }}>
              <PieChart>
                <Pie data={rows} dataKey="count" nameKey="label" innerRadius="68%" outerRadius="100%" paddingAngle={2} stroke="none" isAnimationActive={false}>
                  {rows.map((r) => <Cell key={r.key} fill={r.color} />)}
                </Pie>
                <Tooltip content={<ChartTooltip />} />
              </PieChart>
            </ResponsiveContainer>
            <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-2xl font-semibold tabular-nums">{total}</span>
              <span className="text-xs text-[hsl(var(--muted-foreground))]">documentos</span>
            </span>
          </div>
          <ul className="w-full min-w-0 flex-1" aria-label="Documentos por etapa">
            {rows.map((r) => (
              <li key={r.key}>
                <Link to={`${ROOT}/${r.to}`} className="flex min-h-9 items-center gap-2 rounded-md px-2 text-sm transition-colors hover:bg-[hsl(var(--muted))]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)/50">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} aria-hidden />
                  <span className="min-w-0 flex-1 truncate">{r.label}</span>
                  <span className="font-medium tabular-nums">{r.count}</span>
                  <span className="w-10 text-right text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{Math.round((r.count / total) * 100)}%</span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Panel>
  )
}
