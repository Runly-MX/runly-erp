import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Alert, AlertDescription, Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, ErrorState, PageHeader, SectionCard, Skeleton,
} from '@runly/ui'
import { Ban, Clock, MoreHorizontal, RotateCcw } from 'lucide-react'
import { IncidentDialog } from '../components/results/IncidentDialogs.jsx'
import { RecordDelivery, RecordQuiz } from '../components/results/RecordActivities.jsx'
import { DecisionCard, HistoryCard, TotalsCard } from '../components/results/RecordAside.jsx'
import { PageShell, useRouteSegment } from '../components/shared.jsx'
import { useSessionRecord } from '../hooks/useLmsResults.js'
import { resultsPath } from '../lib/lmsAssessment.js'
import { RESULT_STATUS, scoreText } from '../lib/lmsResults.js'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'
const dateTime = (iso) => (iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

function Fact({ label, children }) {
  return <div className="min-w-0"><dt className={MUTED}>{label}</dt><dd className="break-words text-sm font-medium">{children}</dd></div>
}

function Registration({ record }) {
  const { participant, session } = record
  return (
    <SectionCard title="Participante">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Fact label="Nombre">{participant.name}</Fact>
        <Fact label="Correo">{participant.email || '—'}</Fact>
        {participant.answers.filter((item) => item.key !== 'correo').map((item) => <Fact key={item.key} label={item.label}>{item.value}</Fact>)}
        <Fact label="Folio">{session.folio ?? '—'}</Fact>
        <Fact label="Intento">{session.number}</Fact>
        <Fact label="Inicio">{dateTime(session.startedAt)}</Fact>
        <Fact label={session.closedReason === 'timeout' ? 'Venció' : 'Entrega'}>{dateTime(session.submittedAt)}</Fact>
        <Fact label="Tiempo usado">{session.usedMinutes === null ? '—' : `${session.usedMinutes} min${session.timeLimitMinutes ? ` de ${session.timeLimitMinutes + (session.extendedMinutes ?? 0)}` : ''}`}</Fact>
        <Fact label="Aviso de privacidad">{participant.consent ? `Aceptó v. ${participant.consent.version} · ${dateTime(participant.consent.acceptedAt)}` : 'No se pidió'}</Fact>
      </dl>
    </SectionCard>
  )
}

// Candidate record: /results/:assessmentId/sessions/:sessionId. Everything about
// one session on one page: registration, answers and files with grading
// inputs, totals, decision (apart from the score), history and incidents.
export default function LmsCandidateRecord() {
  const navigate = useNavigate()
  const assessmentId = useRouteSegment(1), sessionId = useRouteSegment(3)
  const query = useSessionRecord(sessionId)
  const [incident, setIncident] = useState(null)
  const dirty = useRef(new Set())
  const [anyDirty, setAnyDirty] = useState(false)
  const onDirty = (id, value) => { if (value) dirty.current.add(id); else dirty.current.delete(id); setAnyDirty(dirty.current.size > 0) }
  const refresh = () => query.refetch()
  useEffect(() => {
    if (!anyDirty) return undefined
    const warn = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [anyDirty])
  const back = () => navigate(resultsPath(assessmentId))

  if (query.isLoading) return <PageShell><PageHeader title="Expediente" loading onBack={back} backLabel="Resultados" /><Skeleton className="h-40 rounded-2xl" /><Skeleton className="h-96 rounded-2xl" /></PageShell>
  if (query.isError || !query.data) {
    const forbidden = query.error?.status === 403
    return (
      <PageShell>
        <PageHeader title="Expediente" onBack={back} backLabel="Resultados" />
        <ErrorState title={forbidden ? 'No estás autorizado para ver este expediente' : query.error?.status === 404 ? 'El expediente no existe' : 'No se pudo cargar el expediente'} description={query.error?.message} onRetry={forbidden ? undefined : refresh} />
      </PageShell>
    )
  }
  const record = query.data
  const { session, permissions } = record
  const status = RESULT_STATUS[session.status] ?? { label: session.status, variant: 'secondary' }
  const canGrade = permissions.canGrade
  const actions = permissions.canManageSession ? (
    <DropdownMenu>
      <DropdownMenuTrigger asChild><Button variant="outline"><MoreHorizontal />Incidencias</Button></DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onSelect={() => setIncident('extend')} disabled={!session.running}><Clock />Extender el tiempo</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setIncident('extra')}><RotateCcw />Autorizar un intento adicional</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => setIncident('void')} disabled={['voided', 'graded'].includes(session.status)} className="text-[hsl(var(--destructive))]"><Ban />Anular la sesión</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  ) : null

  return (
    <PageShell>
      <PageHeader
        onBack={back} backLabel="Resultados" eyebrow={record.assessment.title} title={record.participant.name}
        description={(
          <span className="inline-flex flex-wrap items-center gap-2">
            <Badge variant={status.variant}>{status.label}</Badge>
            {session.folio ? <span className="font-mono text-xs">{session.folio}</span> : null}
            <span className="tabular-nums">{scoreText(record.totals.scorePoints, record.totals.maxPoints)}{record.totals.complete ? '' : ' · parcial'}</span>
            {anyDirty ? <span className="text-[hsl(var(--muted-foreground))]">Cambios sin guardar</span> : null}
          </span>
        )}
        actions={actions} collapseOnScroll sticky className="mb-2 pb-0"
      />
      {session.status === 'in_progress' ? <Alert><AlertDescription>La sesión sigue en curso: se califica cuando termina.</AlertDescription></Alert> : null}
      {session.status === 'voided' ? <Alert><AlertDescription>Sesión anulada. Sus respuestas y archivos se conservan, pero no se califica.</AlertDescription></Alert> : null}
      {permissions.role === 'reader' ? <Alert><AlertDescription>Tienes acceso de lectura: puedes consultar y descargar, pero no calificar.</AlertDescription></Alert> : null}
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,360px)] lg:items-start">
        <div className="min-w-0 space-y-4">
          {/* Phones and tablets: the score right after the header. */}
          <div className="lg:hidden"><TotalsCard record={record} /></div>
          <Registration record={record} />
          {record.activities.map((activity) => (activity.kind === 'quiz'
            ? <RecordQuiz key={activity.lessonId} sessionId={session.id} activity={activity} canGrade={canGrade} onDirty={onDirty} onConflict={refresh} />
            : <RecordDelivery key={activity.lessonId} sessionId={session.id} activity={activity} canGrade={canGrade} onDirty={onDirty} onConflict={refresh} />))}
        </div>
        <aside className="min-w-0 space-y-4 lg:sticky lg:top-24" aria-label="Resumen del expediente">
          <div className="hidden lg:block"><TotalsCard record={record} /></div>
          <DecisionCard record={record} onConflict={refresh} />
          <HistoryCard history={record.history} />
        </aside>
      </div>
      <IncidentDialog kind={incident} record={record} onOpenChange={(open) => { if (!open) setIncident(null) }} onConflict={refresh} />
    </PageShell>
  )
}
