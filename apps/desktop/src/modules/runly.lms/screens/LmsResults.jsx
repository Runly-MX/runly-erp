import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { Badge, DataTable, PageHeader } from '@runly/ui'
import { BarChart3 } from 'lucide-react'
import { PageShell } from '../components/shared.jsx'
import { useResultAssessments } from '../hooks/useLmsResults.js'
import { resultsPath } from '../lib/lmsAssessment.js'

const ROLE = { manager: ['Administración', 'secondary'], grader: ['Evaluador', 'success'], reader: ['Lectura', 'outline'] }

// /results: the evaluations whose results this person may open (managers,
// graders and results readers; with a reviewer list, only those listed).
export default function LmsResults() {
  const query = useResultAssessments()
  const columns = useMemo(() => [
    {
      id: 'title', header: 'Evaluación', accessorFn: (r) => r.title,
      cell: ({ row }) => <Link to={resultsPath(row.original.id)} className="font-medium underline-offset-2 hover:underline">{row.original.title}</Link>,
    },
    { id: 'role', header: 'Tu acceso', accessorFn: (r) => r.role, cell: ({ row }) => { const [label, variant] = ROLE[row.original.role] ?? [row.original.role, 'outline']; return <Badge variant={variant}>{label}</Badge> } },
    { id: 'sessions', header: 'Sesiones', accessorFn: (r) => r.sessions, cell: ({ row }) => <span className="tabular-nums">{row.original.sessions}</span> },
    { id: 'toReview', header: 'Por revisar', accessorFn: (r) => r.toReview, cell: ({ row }) => (row.original.toReview ? <Badge variant="secondary">{row.original.toReview}</Badge> : <span className="tabular-nums">0</span>) },
    { id: 'graded', header: 'Calificadas', accessorFn: (r) => r.graded, cell: ({ row }) => <span className="tabular-nums">{row.original.graded}</span> },
  ], [])
  return (
    <PageShell>
      <PageHeader eyebrow="Aprendizaje" title="Resultados de evaluaciones" description="Revisa, califica y compara a los participantes de las evaluaciones que tienes asignadas." />
      <DataTable
        columns={columns} data={query.data ?? []} getRowId={(r) => r.id} isLoading={query.isLoading} isError={query.isError} onRetry={() => query.refetch()}
        searchPlaceholder="Buscar evaluación…" emptyIcon={BarChart3} emptyTitle="Sin evaluaciones"
        emptyDescription="Aquí aparecen las evaluaciones publicadas en las que eres evaluador o lector de resultados."
      />
    </PageShell>
  )
}
