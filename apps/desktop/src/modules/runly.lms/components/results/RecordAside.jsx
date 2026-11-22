import { useEffect, useState } from 'react'
import { Badge, Button, SectionCard, SelectField, TextareaField, cn } from '@runly/ui'
import { History, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { errorCode } from '../../hooks/useLmsEval.js'
import { useDecideSession } from '../../hooks/useLmsResults.js'
import { DECISION_OPTIONS, DECISION_VARIANTS, HISTORY_LABELS, decisionLabel, historyChange, percent, scoreText } from '../../lib/lmsResults.js'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'
const dateTime = (iso) => (iso ? new Date(iso).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' }) : '—')

export function TotalsCard({ record }) {
  const { totals, activities } = record
  const pct = percent(totals.scorePoints, totals.maxPoints)
  return (
    <SectionCard title="Calificación">
      <div className="space-y-3" data-testid="record-totals">
        <div className="flex items-baseline justify-between gap-2">
          <p className="text-3xl font-semibold tabular-nums">{scoreText(totals.scorePoints, totals.maxPoints)}</p>
          {pct !== null ? <span className={MUTED}>{pct}%</span> : null}
        </div>
        <p className={MUTED}>{totals.complete ? 'Calificación final de la sesión.' : `Parcial: ${totals.pendingCount === 1 ? 'falta 1 actividad' : `faltan ${totals.pendingCount} actividades`} por revisar.`}</p>
        <ul className="space-y-1.5">
          {activities.map((item) => (
            <li key={item.lessonId} className="flex items-start justify-between gap-3 text-sm">
              <span className="line-clamp-2 min-w-0" title={item.title}>{item.title}</span>
              <span className="flex shrink-0 flex-col items-end gap-1 tabular-nums">{scoreText(item.score, item.maxPoints)}{item.pending ? <Badge variant="secondary" className="whitespace-nowrap">Por revisar</Badge> : null}</span>
            </li>
          ))}
        </ul>
        <p className={MUTED}>El máximo es el de la configuración al iniciar la sesión.</p>
      </div>
    </SectionCard>
  )
}

// The hiring decision is recorded by a person, apart from the score.
export function DecisionCard({ record, onConflict }) {
  const { session, permissions } = record
  const decide = useDecideSession(session.id)
  const [decision, setDecision] = useState(session.decision ?? 'pending')
  const [note, setNote] = useState(session.decisionNote ?? '')
  useEffect(() => { setDecision(session.decision ?? 'pending'); setNote(session.decisionNote ?? '') }, [session.updatedAt]) // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = decision !== (session.decision ?? 'pending') || note !== (session.decisionNote ?? '')
  async function save() {
    try { await decide.mutateAsync({ decision, note: note.trim() || null, expectedUpdatedAt: session.updatedAt }) } catch (error) {
      toast.error(error.message || 'No se pudo guardar la decisión.')
      if (errorCode(error) === 'CONFLICT') onConflict()
    }
  }
  return (
    <SectionCard title="Decisión">
      <div className="space-y-3">
        <p className={MUTED}>Independiente de la calificación: la registra una persona y nunca se calcula con el puntaje.</p>
        {permissions.canDecide ? (
          <>
            <SelectField label="Decisión" options={DECISION_OPTIONS} value={decision} onValueChange={setDecision} />
            <TextareaField label="Nota" rows={3} maxLength={5000} value={note} onChange={(event) => setNote(event.target.value)} />
            <Button onClick={save} disabled={!dirty || decide.isPending} className="w-full">
              {decide.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Save />}Guardar decisión
            </Button>
          </>
        ) : (
          <div className="space-y-1">
            <Badge variant={DECISION_VARIANTS[session.decision ?? 'pending']}>{decisionLabel(session.decision)}</Badge>
            {session.decisionNote ? <p className="whitespace-pre-wrap text-sm">{session.decisionNote}</p> : null}
          </div>
        )}
      </div>
    </SectionCard>
  )
}

export function HistoryCard({ history }) {
  return (
    <SectionCard title="Historial" icon={History}>
      {history.length ? (
        <ol className="space-y-3" data-testid="record-history">
          {history.map((event) => (
            <li key={event.id} className="relative space-y-0.5 border-l-2 border-[hsl(var(--border))] pl-3">
              <p className="text-sm"><span className="font-medium">{event.actorName}</span> {HISTORY_LABELS[event.action]?.toLowerCase() ?? event.action}</p>
              {historyChange(event) ? <p className="text-sm tabular-nums">{historyChange(event)}</p> : null}
              {event.reason ? <p className={cn(MUTED, 'italic')}>Motivo: {event.reason}</p> : null}
              <p className={MUTED}>{dateTime(event.createdAt)}</p>
            </li>
          ))}
        </ol>
      ) : <p className={MUTED}>Todavía no hay calificaciones ni incidencias.</p>}
    </SectionCard>
  )
}
