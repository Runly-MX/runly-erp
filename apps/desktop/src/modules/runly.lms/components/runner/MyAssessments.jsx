import { Badge, Button } from '@runly/ui'
import { ClipboardList } from 'lucide-react'
import { formatTimeLimit } from '../../lib/lmsAssessment.js'
import { SESSION_STATUS_LABELS } from '../../lib/lmsSession.js'

function actionFor(item) {
  const last = item.lastSession
  if (last?.status === 'in_progress') return 'Continuar'
  if (item.assessment.status === 'published' && item.sessionsUsed < item.sessionsAllowed) return last ? 'Presentar otra vez' : 'Presentar'
  return last ? 'Ver entrega' : null
}

// "Mis evaluaciones": evaluations assigned to the user, with their last session.
export function MyAssessments({ items, onOpen }) {
  if (!items?.length) return null
  return (
    <section className="space-y-3" aria-labelledby="lms-my-assessments">
      <div>
        <h2 id="lms-my-assessments" className="text-base font-semibold">Mis evaluaciones</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Exámenes y pruebas con tiempo límite. El tiempo corre desde que pulsas Iniciar.</p>
      </div>
      <ul className="space-y-2">
        {items.map((item) => {
          const action = actionFor(item)
          const last = item.lastSession
          return (
            <li key={item.assessment.id} className="flex flex-col gap-3 rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 sm:flex-row sm:items-center">
              <ClipboardList className="hidden h-5 w-5 shrink-0 text-[hsl(var(--muted-foreground))] sm:block" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">{item.assessment.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
                  <span>{formatTimeLimit(item.assessment.timeLimitMinutes)}</span>
                  <Badge variant={last?.status === 'in_progress' ? 'warning' : 'outline'}>{last ? SESSION_STATUS_LABELS[last.status] ?? last.status : 'Sin iniciar'}</Badge>
                </p>
              </div>
              {action ? <Button variant={action === 'Ver entrega' ? 'outline' : 'default'} onClick={() => onOpen(item.assessment.id)} className="sm:w-auto">{action}</Button> : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
