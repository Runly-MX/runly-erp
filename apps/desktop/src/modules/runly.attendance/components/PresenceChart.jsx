import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { EmptyState } from '@runly/ui'
import { Users } from 'lucide-react'
import { TEAL } from './shared.jsx'

// Horizontal bar chart of people currently inside, one bar per bucket.
export function PresenceChart({ title, data, bare = false }) {
  return (
    <div className={bare ? 'rounded-xl border border-[hsl(var(--border))] p-4' : 'rounded-2xl surface-card p-4'}>
      <h3 className="mb-3 text-sm font-semibold">{title}</h3>
      {data.length === 0 ? (
        <EmptyState variant="compact" icon={Users} title="Nadie presente por ahora." />
      ) : (
        <div style={{ height: Math.max(140, data.length * 38 + 30) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16, top: 4, bottom: 4 }}>
              <CartesianGrid horizontal={false} strokeOpacity={0.15} />
              <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }} />
              <YAxis type="category" dataKey="label" width={110} tick={{ fontSize: 12, fill: 'hsl(var(--foreground))' }} />
              <Tooltip contentStyle={{ background: 'hsl(var(--background))', border: '1px solid hsl(var(--border))', borderRadius: 8, color: 'hsl(var(--foreground))' }} formatter={(value) => [value, 'Presentes']} cursor={{ fill: 'rgba(13,148,136,0.08)' }} />
              <Bar dataKey="count" fill={TEAL} radius={[0, 6, 6, 0]} barSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}
