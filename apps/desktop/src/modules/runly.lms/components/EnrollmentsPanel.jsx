import { useMemo, useState } from 'react'
import {
  Badge, Button, ConfirmDialog, DataTable, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSub, DropdownMenuSubContent,
  DropdownMenuSubTrigger, DropdownMenuTrigger, ProgressBar,
} from '@runly/ui'
import { CalendarClock, ListChecks, MoreHorizontal, RotateCcw, ShieldOff, UserMinus, UserPlus, Users } from 'lucide-react'
import { useEnrollments, useLmsPermissions, useUpdateEnrollment } from '../hooks/useLmsData.js'
import { useDownloadCertificate, useIssueCertificate, useRevokeCertificate } from '../hooks/useLmsCerts.js'
import { useGrantExtraAttempt } from '../hooks/useLmsEval.js'
import { hasValidCertificate } from '../lib/lmsCert.js'
import { SOURCE_LABELS, formatShortDate, isOverdue } from '../lib/lmsLabels.js'
import { AssignLearnersDialog } from './AssignLearnersDialog.jsx'
import { CertificateCell } from './certificates/CertificateCell.jsx'
import { RevokeCertificateDialog } from './certificates/RevokeCertificateDialog.jsx'
import { DueDateDialog } from './DueDateDialog.jsx'
import { EnrollmentStatusBadge } from './shared.jsx'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'

// Alumnos tab: who is enrolled, their progress and due dates.
export function EnrollmentsPanel({ courseId, readOnly = false }) {
  const enrollments = useEnrollments(courseId)
  const update = useUpdateEnrollment(), grant = useGrantExtraAttempt()
  const issue = useIssueCertificate(), revoke = useRevokeCertificate(), download = useDownloadCertificate()
  const { canGrade, canManageEnrollments } = useLmsPermissions()
  const canCertify = !readOnly && canManageEnrollments
  const [assignOpen, setAssignOpen] = useState(false)
  const [dueFor, setDueFor] = useState(null)
  const [dropFor, setDropFor] = useState(null)
  const [revokeFor, setRevokeFor] = useState(null)
  const rows = useMemo(() => enrollments.data ?? [], [enrollments.data])

  async function patch(id, data, after) {
    try {
      await update.mutateAsync({ id, ...data })
      after?.()
    } catch { /* toast shown by the mutation */ }
  }

  async function confirmRevoke(reason) {
    try {
      await revoke.mutateAsync({ id: revokeFor.certificate.id, reason })
      setRevokeFor(null)
    } catch { /* toast shown by the mutation */ }
  }

  const columns = useMemo(() => [
    {
      id: 'learner', header: 'Alumno', accessorFn: (e) => `${e.learner?.displayName ?? ''} ${e.learner?.email ?? ''}`,
      cell: ({ row }) => (
        <div className="min-w-0">
          <p className="flex min-w-0 items-center gap-1.5 font-medium leading-tight">
            <span className="truncate">{row.original.learner?.displayName ?? '—'}</span>
            {row.original.learner?.kind === 'guest' ? <Badge variant="outline" className="shrink-0" title="Entró con el enlace público del curso">Invitado</Badge> : null}
          </p>
          <p className={`${MUTED} truncate`}>{row.original.learner?.email || SOURCE_LABELS[row.original.source] || ''}</p>
        </div>
      ),
    },
    {
      id: 'progress', header: 'Avance', accessorFn: (e) => e.progressPct ?? 0,
      cell: ({ row }) => (
        <div className="flex min-w-28 items-center gap-2">
          <ProgressBar value={row.original.progressPct ?? 0} className="flex-1" barClassName={row.original.status === 'completed' ? 'bg-emerald-600' : undefined} />
          <span className="w-9 text-right text-xs tabular-nums">{row.original.progressPct ?? 0}%</span>
        </div>
      ),
    },
    {
      id: 'status', header: 'Estado', accessorFn: (e) => e.status,
      cell: ({ row }) => (
        <div className="flex flex-wrap items-center gap-1">
          <EnrollmentStatusBadge status={row.original.status} />
          {isOverdue(row.original) ? <Badge variant="destructive">Vencido</Badge> : null}
          {row.original.failedLessons?.length ? (
            <Badge variant="destructive" title={row.original.failedLessons.map((lesson) => lesson.title).join(', ')}>
              {row.original.failedLessons.length === 1 ? 'Examen no aprobado' : `${row.original.failedLessons.length} exámenes no aprobados`}
            </Badge>
          ) : null}
        </div>
      ),
    },
    { id: 'due', header: 'Vence', accessorFn: (e) => e.dueAt ?? '', cell: ({ row }) => <span className={MUTED}>{formatShortDate(row.original.dueAt) || '—'}</span> },
    { id: 'completed', header: 'Completado', accessorFn: (e) => e.completedAt ?? '', cell: ({ row }) => <span className={MUTED}>{formatShortDate(row.original.completedAt) || '—'}</span> },
    {
      id: 'certificate', header: 'Certificado', accessorFn: (e) => e.certificate?.folio ?? '',
      cell: ({ row }) => (
        <CertificateCell
          enrollment={row.original} canManage={canCertify} issuing={issue.isPending}
          onDownload={(certificate) => download.mutate(certificate)} onIssue={(enrollment) => issue.mutate(enrollment.id)}
        />
      ),
    },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => (readOnly ? null : (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label="Acciones"><MoreHorizontal /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {row.original.status === 'active' ? <DropdownMenuItem onSelect={() => setDueFor(row.original)}><CalendarClock />Cambiar fecha límite</DropdownMenuItem> : null}
            {row.original.status === 'active' ? <DropdownMenuItem onSelect={() => setDropFor(row.original)} className="text-[hsl(var(--destructive))]"><UserMinus />Dar de baja</DropdownMenuItem> : null}
            {canGrade && row.original.status !== 'dropped' && row.original.failedLessons?.length ? (
              <DropdownMenuSub>
                <DropdownMenuSubTrigger><ListChecks />Otorgar intento extra</DropdownMenuSubTrigger>
                <DropdownMenuSubContent>
                  {row.original.failedLessons.map((lesson) => (
                    <DropdownMenuItem key={lesson.id} disabled={grant.isPending} onSelect={() => grant.mutate({ enrollmentId: row.original.id, lessonId: lesson.id })}>
                      {lesson.title}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuSubContent>
              </DropdownMenuSub>
            ) : null}
            {row.original.status === 'dropped' ? <DropdownMenuItem onSelect={() => patch(row.original.id, { status: 'active' })}><RotateCcw />Reactivar</DropdownMenuItem> : null}
            {canCertify && hasValidCertificate(row.original) ? (
              <DropdownMenuItem onSelect={() => setRevokeFor(row.original)} className="text-[hsl(var(--destructive))]"><ShieldOff />Revocar certificado</DropdownMenuItem>
            ) : null}
            {row.original.status === 'completed' && !(canCertify && hasValidCertificate(row.original)) ? <DropdownMenuItem disabled>Curso completado</DropdownMenuItem> : null}
          </DropdownMenuContent>
        </DropdownMenu>
      )),
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  ], [readOnly, canGrade, canCertify, grant.isPending, issue.isPending])

  return (
    <div className="space-y-3">
      <DataTable
        columns={columns}
        data={rows}
        getRowId={(e) => e.id}
        isLoading={enrollments.isLoading}
        isError={enrollments.isError}
        onRetry={() => enrollments.refetch()}
        pageSize={25}
        searchPlaceholder="Buscar alumno…"
        toolbarActions={readOnly ? null : <Button onClick={() => setAssignOpen(true)}><UserPlus />Asignar alumnos</Button>}
        emptyIcon={Users}
        emptyTitle="Nadie está inscrito todavía"
        emptyDescription="Asigna el curso a tu equipo o actívale la inscripción libre en Configuración."
      />
      <AssignLearnersDialog open={assignOpen} onOpenChange={setAssignOpen} courseId={courseId} enrollments={rows} />
      <DueDateDialog
        open={Boolean(dueFor)} onOpenChange={(open) => { if (!open) setDueFor(null) }} enrollment={dueFor} pending={update.isPending}
        onSubmit={(dueAt) => patch(dueFor.id, { dueAt }, () => setDueFor(null))}
      />
      <ConfirmDialog
        open={Boolean(dropFor)} onOpenChange={(open) => { if (!open) setDropFor(null) }}
        icon={UserMinus}
        title="Dar de baja del curso"
        description={`${dropFor?.learner?.displayName ?? 'La persona'} dejará de ver el curso en «Mis cursos». Su avance se conserva si la reactivas después.`}
        confirmLabel="Dar de baja"
        loading={update.isPending}
        onConfirm={() => patch(dropFor.id, { status: 'dropped' }, () => setDropFor(null))}
      />
      <RevokeCertificateDialog
        open={Boolean(revokeFor)} onOpenChange={(open) => { if (!open) setRevokeFor(null) }}
        enrollment={revokeFor} pending={revoke.isPending} onSubmit={confirmRevoke}
      />
    </div>
  )
}
