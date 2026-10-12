import { Badge } from '@runly/ui'
import { Link2 } from 'lucide-react'
import { KIND_LABELS } from '../../lib/attendanceLabels.js'

const STATUS = {
  create: { label: 'Crear', variant: 'success' },
  update: { label: 'Actualizar', variant: 'warning' },
  skip: { label: 'Omitida', variant: 'secondary' },
  error: { label: 'Error', variant: 'destructive' },
}

function Chip({ value, label, tone }) {
  return (
    <div className="rounded-xl border border-[hsl(var(--border))] px-3 py-2">
      <p className={`text-lg font-semibold tabular-nums ${tone ?? 'text-[hsl(var(--foreground))]'}`}>{value}</p>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">{label}</p>
    </div>
  )
}

// Step 3: summary chips + per-row table of what the import would do.
export function PeopleImportPreview({ preview }) {
  const { summary, rows } = preview
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Chip value={summary.create} label="Por crear" tone="text-emerald-600 dark:text-emerald-400" />
        <Chip value={summary.update} label="Por actualizar" tone="text-amber-600 dark:text-amber-400" />
        <Chip value={summary.skip} label="Omitidas" />
        <Chip value={summary.error} label="Con error" tone={summary.error ? 'text-red-600 dark:text-red-400' : undefined} />
      </div>
      {summary.newGroups?.length || summary.newCategories?.length ? (
        <div className="space-y-1 rounded-xl bg-[hsl(var(--muted))]/40 px-4 py-3 text-xs text-[hsl(var(--muted-foreground))]">
          {summary.newGroups?.length ? <p><span className="font-medium text-[hsl(var(--foreground))]">Grupos nuevos:</span> {summary.newGroups.join(', ')}</p> : null}
          {summary.newCategories?.length ? <p><span className="font-medium text-[hsl(var(--foreground))]">Categorías nuevas:</span> {summary.newCategories.join(', ')}</p> : null}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-[hsl(var(--border))]">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-[hsl(var(--muted))]/50 text-xs text-[hsl(var(--muted-foreground))]">
            <tr>
              {['Fila', 'Estado', 'Persona', 'Grupo / categoría', 'Expediente RH'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-[hsl(var(--border))]">
            {rows.map((r) => {
              const st = STATUS[r.status] ?? STATUS.skip
              return (
                <tr key={r.row} className="align-top">
                  <td className="px-3 py-2 tabular-nums text-[hsl(var(--muted-foreground))]">{r.row}</td>
                  <td className="px-3 py-2"><Badge variant={st.variant}>{st.label}</Badge></td>
                  <td className="px-3 py-2">
                    <p className="font-medium text-[hsl(var(--foreground))]">{r.person?.name || '—'}</p>
                    <p className="text-xs text-[hsl(var(--muted-foreground))]">
                      {[r.person?.code, KIND_LABELS[r.person?.kind] ?? r.person?.kind, r.person?.shift].filter(Boolean).join(' · ')}
                    </p>
                    {r.errors?.map((e) => <p key={e} className="text-xs text-red-600 dark:text-red-400">{e}</p>)}
                  </td>
                  <td className="px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">{[r.person?.group, r.person?.category].filter(Boolean).join(' / ') || '—'}</td>
                  <td className="px-3 py-2 text-xs">
                    {r.hrMatch ? <span className="inline-flex items-center gap-1 text-(--brand-primary)"><Link2 className="h-3.5 w-3.5" />{r.hrMatch.fullName}</span> : <span className="text-[hsl(var(--muted-foreground))]">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
