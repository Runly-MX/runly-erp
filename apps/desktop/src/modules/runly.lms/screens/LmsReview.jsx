import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Badge, Button, ComboboxField, DataTable, PageHeader, SegmentedControl } from '@runly/ui'
import { ClipboardCheck, History, Paperclip } from 'lucide-react'
import { GradeAttemptSheet } from '../components/review/GradeAttemptSheet.jsx'
import { GradeSubmissionSheet } from '../components/review/GradeSubmissionSheet.jsx'
import { PageShell } from '../components/shared.jsx'
import { useReviewQueue } from '../hooks/useLmsEval.js'
import { REVIEW_TYPE_LABELS, formatShortDate } from '../lib/lmsLabels.js'
import { filesCountText, parseReviewParam, reviewParam } from '../lib/lmsReview.js'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'

const VIEWS = [{ value: 'pending', label: 'Pendientes' }, { value: 'history', label: 'Calificadas' }]

// Result of graded work: approved/returned (assignments) or the exam score.
function ResultCell({ item }) {
  const grade = item.grade === null || item.grade === undefined ? null : Math.round(item.grade * 10) / 10
  if (item.type === 'submission') {
    return (
      <span className="inline-flex items-center gap-2">
        <Badge variant={item.status === 'approved' ? 'success' : 'warning'}>{item.status === 'approved' ? 'Aprobada' : 'Devuelta'}</Badge>
        {grade !== null ? <span className="text-sm tabular-nums">{grade}</span> : null}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Badge variant={item.passed ? 'success' : 'destructive'}>{item.passed ? 'Aprobado' : 'No aprobado'}</Badge>
      {grade !== null ? <span className="text-sm tabular-nums">{grade}%</span> : null}
    </span>
  )
}

// Grading queue (Pendientes): assignment submissions and quiz attempts with
// open answers waiting for a grader, oldest first. Calificadas: the history of
// work already graded by a person, newest first, opened read-only. The course
// filter is applied locally so its options list every course in the view.
export default function LmsReview() {
  const [view, setView] = useState('pending')
  const queue = useReviewQueue(view)
  const history = view === 'history'
  const [courseId, setCourseId] = useState(null)
  // The open sheet lives in ?revisar=type:id so it survives opening a file in
  // Office and coming back.
  const [searchParams, setSearchParams] = useSearchParams()
  const open = parseReviewParam(searchParams.get('revisar'))
  const setOpen = useCallback((next) => {
    setSearchParams((current) => {
      const params = new URLSearchParams(current)
      const value = reviewParam(next)
      if (value) params.set('revisar', value)
      else params.delete('revisar')
      return params
    }, { replace: true })
  }, [setSearchParams])

  const items = useMemo(() => queue.data ?? [], [queue.data])
  const courseOptions = useMemo(() => {
    const seen = new Map()
    for (const item of items) if (item.courseId && !seen.has(item.courseId)) seen.set(item.courseId, item.courseTitle || 'Curso')
    return [...seen].map(([value, label]) => ({ value, label }))
  }, [items])
  const rows = useMemo(() => (courseId ? items.filter((item) => item.courseId === courseId) : items), [items, courseId])

  const columns = useMemo(() => [
    { id: 'type', header: 'Tipo', accessorFn: (r) => REVIEW_TYPE_LABELS[r.type] ?? r.type, cell: ({ getValue }) => <Badge variant="secondary">{getValue()}</Badge> },
    { id: 'course', header: 'Curso', accessorFn: (r) => r.courseTitle ?? '', cell: ({ getValue }) => <span className="block max-w-56 truncate">{getValue() || '—'}</span> },
    { id: 'lesson', header: 'Lección', accessorFn: (r) => r.lessonTitle ?? '', cell: ({ getValue }) => <span className="block max-w-56 truncate font-medium">{getValue() || '—'}</span> },
    { id: 'learner', header: 'Alumno', accessorFn: (r) => (r.learner?.displayName ? `${r.learner.displayName}${r.learner.kind === 'guest' ? ' (invitado)' : ''}` : ''), cell: ({ getValue }) => <span className="block max-w-48 truncate">{getValue() || '—'}</span> },
    { id: 'submitted', header: 'Enviado', accessorFn: (r) => r.submittedAt ?? '', cell: ({ row }) => <span className={MUTED}>{formatShortDate(row.original.submittedAt) || '—'}</span> },
    {
      id: 'files', header: 'Archivos', accessorFn: (r) => r.fileCount ?? 0,
      cell: ({ row }) => (row.original.fileCount ? (
        <span className="inline-flex items-center gap-1 text-sm tabular-nums" title={filesCountText(row.original.fileCount)} aria-label={filesCountText(row.original.fileCount)}>
          <Paperclip className="h-3.5 w-3.5 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />{row.original.fileCount}
        </span>
      ) : <span className={MUTED}>—</span>),
    },
    ...(history ? [
      { id: 'result', header: 'Resultado', accessorFn: (r) => r.grade ?? -1, cell: ({ row }) => <ResultCell item={row.original} /> },
      { id: 'graded', header: 'Calificada', accessorFn: (r) => r.gradedAt ?? '', cell: ({ row }) => <span className={MUTED}>{formatShortDate(row.original.gradedAt) || '—'}</span> },
      { id: 'grader', header: 'Revisó', accessorFn: (r) => r.graderName ?? '', cell: ({ getValue }) => <span className="block max-w-40 truncate text-sm">{getValue() || '—'}</span> },
    ] : []),
    { id: 'late', header: 'Tarde', accessorFn: (r) => (r.late ? 1 : 0), cell: ({ row }) => (row.original.late ? <Badge variant="warning">Tardía</Badge> : <span className={MUTED}>—</span>) },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => <Button variant="outline" size="sm" onClick={() => setOpen({ type: row.original.type, id: row.original.id })}>{history ? 'Ver' : 'Calificar'}</Button>,
    },
  ], [setOpen, history])

  const close = (value) => { if (!value) setOpen(null) }
  return (
    <PageShell>
      <PageHeader
        eyebrow="Aprendizaje"
        title="Revisión"
        description="Califica las tareas entregadas y las respuestas abiertas de los exámenes."
        className="mb-2 pb-0"
        actions={<SegmentedControl ariaLabel="Vista" options={VIEWS} value={view} onChange={(next) => { setView(next); setCourseId(null) }} className="w-auto" />}
      />
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(r) => `${r.type}:${r.id}`}
        isLoading={queue.isLoading}
        isError={queue.isError}
        onRetry={() => queue.refetch()}
        pageSize={25}
        searchPlaceholder="Buscar alumno o lección…"
        toolbarStart={(
          <div className="w-full sm:w-64">
            <ComboboxField
              aria-label="Curso" placeholder="Todos los cursos" options={courseOptions} value={courseId}
              onChange={(value) => setCourseId(value || null)} clearable emptyText={history ? 'Sin cursos con calificaciones' : 'Sin cursos con pendientes'}
            />
          </div>
        )}
        emptyIcon={history ? History : ClipboardCheck}
        emptyTitle={history ? (courseId ? 'Sin calificaciones en este curso' : 'Todavía no hay calificaciones') : (courseId ? 'Nada pendiente en este curso' : 'Nada por revisar')}
        emptyDescription={history
          ? 'Las tareas y los exámenes que califiques aparecerán aquí, del más reciente al más antiguo.'
          : 'Cuando un alumno entregue una tarea o un examen con respuestas abiertas, aparecerá aquí.'}
      />
      <GradeSubmissionSheet submissionId={open?.type === 'submission' ? open.id : null} onOpenChange={close} />
      <GradeAttemptSheet attemptId={open?.type === 'attempt' ? open.id : null} onOpenChange={close} />
    </PageShell>
  )
}
