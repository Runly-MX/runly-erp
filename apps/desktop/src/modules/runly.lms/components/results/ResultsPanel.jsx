import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Alert, AlertDescription, Badge, Button, ChipTabs, DataTable, cn } from '@runly/ui'
import { ChevronRight, Download, FileSpreadsheet, Loader2, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useToken } from '../../hooks/useLmsData.js'
import { saveBlob } from '../../hooks/useLmsCerts.js'
import { downloadResults, useAssessmentResults } from '../../hooks/useLmsResults.js'
import { recordPath } from '../../lib/lmsAssessment.js'
import { DECISION_VARIANTS, RESULT_FILTERS, RESULT_STATUS, decisionLabel, filterRows, percent, scoreText } from '../../lib/lmsResults.js'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'
const dateTime = (iso) => (iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const narrow = () => typeof window !== 'undefined' && window.matchMedia?.('(max-width: 639px)')?.matches

function StatusBadge({ row }) {
  const info = RESULT_STATUS[row.status] ?? { label: row.statusLabel, variant: 'secondary' }
  return <Badge variant={info.variant} className="whitespace-nowrap">{row.status === 'expired' ? 'Por revisar · tiempo agotado' : info.label}</Badge>
}

// Total with a bar relative to the maximum, so scores compare at a glance.
function Total({ row }) {
  const pct = percent(row.scorePoints, row.maxPoints)
  if (row.scorePoints === null || row.scorePoints === undefined) return <span className={MUTED}>—</span>
  return (
    <div className="min-w-28 space-y-1">
      <p className="text-sm font-semibold tabular-nums">{scoreText(row.scorePoints, row.maxPoints)}{row.complete ? '' : <span className="ml-1 text-xs font-normal text-[hsl(var(--muted-foreground))]">parcial</span>}</p>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-[hsl(var(--muted))]" aria-hidden="true">
        <div className={cn('h-full rounded-full', row.complete ? 'bg-[hsl(var(--primary))]' : 'bg-[hsl(var(--muted-foreground)/0.5)]')} style={{ width: `${pct ?? 0}%` }} />
      </div>
    </div>
  )
}

function OpenRecord({ assessmentId, row, children }) {
  if (!row.sessionId) return children
  return <Link to={recordPath(assessmentId, row.sessionId)} className="block min-w-0 rounded-sm underline-offset-2 hover:underline focus-visible:outline-2">{children}</Link>
}

function ResultCard({ assessmentId, row }) {
  const body = (
    <div className="flex items-start gap-3 rounded-md border border-[hsl(var(--border))] p-3">
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="truncate font-medium">{row.learner.name}</p>
        <p className={`${MUTED} truncate`}>{row.learner.email || '—'}</p>
        <div className="flex flex-wrap items-center gap-1.5"><StatusBadge row={row} />{row.session ? <Badge variant={DECISION_VARIANTS[row.session.decision]}>{decisionLabel(row.session.decision)}</Badge> : null}</div>
        <Total row={row} />
      </div>
      {row.sessionId ? <ChevronRight className="mt-1 h-5 w-5 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" /> : null}
    </div>
  )
  return row.sessionId ? <Link to={recordPath(assessmentId, row.sessionId)} className="block min-h-11 rounded-md focus-visible:outline-2" aria-label={`Abrir expediente de ${row.learner.name}`}>{body}</Link> : body
}

// Participants of an evaluation with their scores: filters, comparison by total,
// pending review, decisions (apart from the score) and the CSV/Excel export.
export function ResultsPanel({ assessmentId }) {
  const token = useToken()
  const query = useAssessmentResults(assessmentId)
  const [filter, setFilter] = useState('all')
  const [exporting, setExporting] = useState(null)
  const data = query.data
  const rows = useMemo(() => filterRows(data?.rows ?? [], filter), [data, filter])

  const columns = useMemo(() => [
    {
      id: 'name', header: 'Participante', accessorFn: (r) => `${r.learner.name} ${r.learner.email ?? ''}`,
      cell: ({ row }) => (
        <OpenRecord assessmentId={assessmentId} row={row.original}>
          <p className="truncate font-medium">{row.original.learner.name}</p>
          <p className={`${MUTED} truncate`}>{row.original.learner.email || '—'}</p>
        </OpenRecord>
      ),
    },
    { id: 'status', header: 'Estado', accessorFn: (r) => r.status, cell: ({ row }) => <StatusBadge row={row.original} /> },
    ...(data?.columns ?? []).map((column) => ({
      id: `a-${column.lessonId}`, header: `${column.title} (${column.maxPoints})`, enableSorting: true,
      accessorFn: (r) => r.activities.find((item) => item.lessonId === column.lessonId)?.score ?? -1,
      cell: ({ row }) => {
        const item = row.original.activities.find((value) => value.lessonId === column.lessonId)
        if (item?.pending && item.score === null) return <Badge variant="secondary" className="whitespace-nowrap">Por revisar</Badge>
        if (!item || item.score === null) return <span className={MUTED}>—</span>
        return <span className="whitespace-nowrap tabular-nums">{item.score}{item.pending ? <Badge variant="secondary" className="ml-1.5 whitespace-nowrap">Por revisar</Badge> : null}</span>
      },
    })),
    { id: 'total', header: 'Total', accessorFn: (r) => r.scorePoints ?? -1, cell: ({ row }) => <Total row={row.original} /> },
    {
      id: 'decision', header: 'Decisión', accessorFn: (r) => r.session?.decision ?? '',
      cell: ({ row }) => (row.original.session ? <Badge variant={DECISION_VARIANTS[row.original.session.decision]} className="whitespace-nowrap">{decisionLabel(row.original.session.decision)}</Badge> : <span className={MUTED}>—</span>),
    },
    { id: 'submitted', header: 'Entrega', accessorFn: (r) => r.session?.submittedAt ?? '', cell: ({ row }) => <span className={MUTED}>{dateTime(row.original.session?.submittedAt)}</span> },
  ], [assessmentId, data])

  async function exportAs(format) {
    setExporting(format)
    try {
      const blob = await downloadResults(assessmentId, format, token)
      saveBlob(blob, `resultados.${format}`)
    } catch (error) { toast.error(error.message || 'No se pudo exportar.') } finally { setExporting(null) }
  }

  const summary = data?.summary
  return (
    <section className="space-y-4" aria-label="Resultados">
      {summary ? (
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[['Participantes', summary.participants], ['Iniciaron', summary.started], ['Por revisar', summary.pendingReview], ['Calificadas', summary.graded]].map(([label, value]) => (
            <div key={label} className="rounded-md bg-[hsl(var(--muted)/0.5)] px-3 py-2"><dt className={MUTED}>{label}</dt><dd className="text-xl font-semibold tabular-nums">{value}</dd></div>
          ))}
        </dl>
      ) : null}
      <Alert><AlertDescription>La calificación mide el desempeño en la evaluación. La decisión de cada participante (avanza, en espera, no avanza) la registra una persona en su expediente y nunca se calcula a partir del puntaje.</AlertDescription></Alert>
      <ChipTabs tabs={RESULT_FILTERS} value={filter} onChange={setFilter} tone="violet" ariaLabel="Filtrar por estado" showDescription={false} />
      <DataTable
        columns={columns} data={rows} getRowId={(r) => r.enrollmentId} isLoading={query.isLoading} isError={query.isError} onRetry={() => query.refetch()}
        pageSize={25} searchPlaceholder="Buscar participante…" stateKey={`lms-results-${assessmentId}`}
        viewModes={['table', 'cards']} defaultViewMode={narrow() ? 'cards' : 'table'} viewStorageKey="lms-results-view"
        renderCard={(row) => <ResultCard assessmentId={assessmentId} row={row} />} cardGridClassName="grid gap-2"
        toolbarActions={(
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => exportAs('csv')} disabled={Boolean(exporting) || !data?.rows?.length}>{exporting === 'csv' ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Download />}CSV</Button>
            <Button variant="outline" onClick={() => exportAs('xlsx')} disabled={Boolean(exporting) || !data?.rows?.length}>{exporting === 'xlsx' ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <FileSpreadsheet />}Excel</Button>
          </div>
        )}
        emptyIcon={Users} emptyTitle={filter === 'all' ? 'Sin participantes' : 'Nadie en este estado'}
        emptyDescription={filter === 'all' ? 'Cuando alguien se registre o se le asigne la evaluación aparecerá aquí.' : 'Prueba con otro filtro.'}
      />
    </section>
  )
}
