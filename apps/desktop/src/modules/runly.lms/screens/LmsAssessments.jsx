import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, ChipTabs, DataTable, PageHeader } from '@runly/ui'
import { Archive, ClipboardList, FilePen, Globe, Plus } from 'lucide-react'
import { AssessmentFormDialog, AssessmentStatusBadge } from '../components/assessment/AssessmentParts.jsx'
import { PageShell } from '../components/shared.jsx'
import { useAssessments, useCreateAssessment } from '../hooks/useLmsAssessments.js'
import { assessmentPath, formatPoints, formatTimeLimit } from '../lib/lmsAssessment.js'
import { formatShortDate } from '../lib/lmsLabels.js'

const TABS = [
  { value: 'all', label: 'Activas', icon: ClipboardList, description: 'Borradores y evaluaciones publicadas.' },
  { value: 'draft', label: 'Borradores', icon: FilePen, description: 'En preparación: solo las ven quienes administran Aprendizaje.' },
  { value: 'published', label: 'Publicadas', icon: Globe, description: 'Abiertas para sus participantes.' },
  { value: 'archived', label: 'Archivadas', icon: Archive, description: 'Retiradas: sus resultados quedan de solo lectura.' },
]
const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'
const NUM = ({ getValue }) => <span className="tabular-nums">{getValue()}</span>

// Evaluations list: standalone exams and tests (no course), by status.
export default function LmsAssessments() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('all')
  const [open, setOpen] = useState(false)
  const query = useAssessments(tab === 'all' ? null : { status: tab })
  const create = useCreateAssessment()
  const openOne = (id) => navigate(assessmentPath(id))
  const rows = useMemo(() => (query.data ?? []).filter((row) => tab !== 'all' || row.status !== 'archived'), [query.data, tab])

  async function submit(data) {
    try {
      const created = await create.mutateAsync(data)
      setOpen(false)
      if (created?.id) openOne(created.id)
    } catch { /* toast shown by the mutation */ }
  }

  const columns = useMemo(() => [
    {
      id: 'title', header: 'Evaluación', accessorFn: (r) => r.title,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium leading-tight">{row.original.title}</p>
          <p className={`${MUTED} truncate`}>{formatTimeLimit(row.original.settings?.timeLimitMinutes)}</p>
        </div>
      ),
    },
    { id: 'status', header: 'Estado', accessorFn: (r) => r.status, cell: ({ row }) => <AssessmentStatusBadge status={row.original.status} /> },
    { id: 'activities', header: 'Actividades', accessorFn: (r) => r.activityCount ?? 0, cell: NUM },
    { id: 'points', header: 'Puntos', accessorFn: (r) => r.maxPoints ?? -1, cell: ({ row }) => <span className="tabular-nums">{formatPoints(row.original.maxPoints)}</span> },
    { id: 'participants', header: 'Participantes', accessorFn: (r) => r.participantCount ?? 0, cell: NUM },
    { id: 'updated', header: 'Actualizada', accessorFn: (r) => r.updatedAt ?? '', cell: ({ row }) => <span className={MUTED}>{formatShortDate(row.original.updatedAt)}</span> },
    { id: 'actions', header: '', enableSorting: false, cell: ({ row }) => <Button variant="outline" size="sm" onClick={() => openOne(row.original.id)}>Abrir</Button> },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [])

  return (
    <PageShell>
      <PageHeader
        eyebrow="Aprendizaje"
        title="Evaluaciones"
        description="Exámenes, pruebas técnicas y evaluaciones de selección con un solo tiempo límite, sin necesidad de un curso."
        actions={<Button onClick={() => setOpen(true)} className="w-full sm:w-auto"><Plus />Nueva evaluación</Button>}
        className="mb-2 pb-0"
      />
      <ChipTabs tabs={TABS} value={tab} onChange={setTab} tone="violet" ariaLabel="Estado de las evaluaciones" />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => r.id}
        isLoading={query.isLoading}
        isError={query.isError}
        onRetry={() => query.refetch()}
        pageSize={25}
        searchPlaceholder="Buscar evaluación…"
        emptyIcon={ClipboardList}
        emptyTitle={tab === 'all' ? 'Aún no hay evaluaciones' : 'Sin evaluaciones en este estado'}
        emptyDescription={tab === 'all' ? 'Crea una evaluación con cuestionarios y entregas de archivos, y compártela con un enlace.' : undefined}
        emptyAction={tab === 'all' ? <Button onClick={() => setOpen(true)}><Plus />Nueva evaluación</Button> : undefined}
      />
      <AssessmentFormDialog open={open} onOpenChange={setOpen} onSubmit={submit} pending={create.isPending} />
    </PageShell>
  )
}
