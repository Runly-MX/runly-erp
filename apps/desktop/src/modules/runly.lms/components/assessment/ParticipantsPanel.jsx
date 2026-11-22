import { useMemo, useState } from 'react'
import { Badge, Button, DataTable } from '@runly/ui'
import { FileStack, UserPlus, Users } from 'lucide-react'
import { Link } from 'react-router-dom'
import { recordPath } from '../../lib/lmsAssessment.js'
import { toast } from 'sonner'
import { useAddParticipants, useParticipants } from '../../hooks/useLmsSession.js'
import { formatPoints } from '../../lib/lmsAssessment.js'
import { SESSION_STATUS_LABELS } from '../../lib/lmsSession.js'
import { AssignLearnersDialog } from '../AssignLearnersDialog.jsx'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'
const VARIANTS = { in_progress: 'warning', submitted: 'secondary', expired: 'secondary', graded: 'success', voided: 'outline' }
const dateTime = (iso) => (iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—')
const minutesUsed = (s) => (s?.startedAt && s.submittedAt ? `${Math.max(1, Math.round((Date.parse(s.submittedAt) - Date.parse(s.startedAt)) / 60_000))} min` : '—')
const COPY = {
  title: 'Agregar participantes',
  description: 'Personas de tu empresa que presentarán la evaluación. La verán en «Mis cursos», en Evaluaciones.',
  already: 'Ya es participante',
  dueDate: false,
}

// Participants of an evaluation and the state of their latest session.
export function ParticipantsPanel({ assessmentId, readOnly }) {
  const query = useParticipants(assessmentId)
  const add = useAddParticipants()
  const [open, setOpen] = useState(false)
  const rows = query.data ?? []

  const columns = useMemo(() => [
    {
      id: 'name', header: 'Participante', accessorFn: (r) => r.learner.displayName,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{row.original.learner.displayName}</p>
          <p className={`${MUTED} truncate`}>{row.original.learner.email || '—'}</p>
        </div>
      ),
    },
    {
      id: 'status', header: 'Estado', accessorFn: (r) => r.sessions[0]?.status ?? '',
      cell: ({ row }) => {
        const s = row.original.sessions[0]
        if (!s) return <Badge variant="outline">Sin iniciar</Badge>
        return <Badge variant={VARIANTS[s.status] ?? 'secondary'}>{s.closedReason === 'timeout' && s.status !== 'graded' ? 'Tiempo agotado' : SESSION_STATUS_LABELS[s.status] ?? s.status}</Badge>
      },
    },
    { id: 'started', header: 'Inicio', accessorFn: (r) => r.sessions[0]?.startedAt ?? '', cell: ({ row }) => <span className={MUTED}>{dateTime(row.original.sessions[0]?.startedAt)}</span> },
    { id: 'submitted', header: 'Entrega', accessorFn: (r) => r.sessions[0]?.submittedAt ?? '', cell: ({ row }) => <span className={MUTED}>{dateTime(row.original.sessions[0]?.submittedAt)}</span> },
    { id: 'used', header: 'Tiempo usado', enableSorting: false, cell: ({ row }) => <span className="tabular-nums text-sm">{minutesUsed(row.original.sessions[0])}</span> },
    {
      id: 'points', header: 'Puntos', accessorFn: (r) => r.sessions[0]?.scorePoints ?? -1,
      cell: ({ row }) => {
        const s = row.original.sessions[0]
        return s?.scorePoints !== null && s?.scorePoints !== undefined ? <span className="tabular-nums">{s.scorePoints} / {s.maxPoints}</span> : <span className={MUTED}>{s ? `Máx. ${formatPoints(s.maxPoints)}` : '—'}</span>
      },
    },
    {
      id: 'files', header: '', enableSorting: false,
      cell: ({ row }) => {
        const s = row.original.sessions[0]
        return s ? <Button variant="ghost" size="sm" asChild><Link to={recordPath(assessmentId, s.id)}><FileStack />Expediente</Link></Button> : null
      },
    },
  ], [assessmentId])

  async function assign(userProfileIds) {
    const result = await add.mutateAsync({ assessmentId, userProfileIds })
    if (!result?.created && !result?.reactivated) toast.info('Esas personas ya eran participantes.')
    return result
  }

  return (
    <section className="space-y-3" aria-label="Participantes">
      <DataTable
        columns={columns} data={rows} getRowId={(r) => r.enrollmentId}
        isLoading={query.isLoading} isError={query.isError} onRetry={() => query.refetch()}
        pageSize={25} searchPlaceholder="Buscar participante…"
        toolbarStart={!readOnly ? <Button onClick={() => setOpen(true)}><UserPlus />Agregar participantes</Button> : null}
        emptyIcon={Users} emptyTitle="Sin participantes"
        emptyDescription="Agrega a las personas de tu empresa que deben presentarla."
      />
      <AssignLearnersDialog
        open={open} onOpenChange={setOpen} enrollments={rows.map((r) => ({ status: r.status, learner: r.learner }))}
        onAssign={assign} pending={add.isPending} copy={COPY}
      />
    </section>
  )
}
