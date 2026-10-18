import { cn } from '@runly/ui'
import { CheckCircle2, Circle, CircleDot, XCircle } from 'lucide-react'
import { blankRows, matchingRows, numericAnswerText, orderingRows } from '../../lib/lmsAnswers.js'

const OK = 'text-emerald-600 dark:text-emerald-400'
const BAD = 'text-[hsl(var(--destructive))]'
const MUTED = 'text-[hsl(var(--muted-foreground))]'

function Mark({ ok }) {
  if (ok === true) return <CheckCircle2 className={cn('mt-0.5 h-4 w-4 shrink-0', OK)} aria-label="Correcto" />
  if (ok === false) return <XCircle className={cn('mt-0.5 h-4 w-4 shrink-0', BAD)} aria-label="Incorrecto" />
  return null
}

const Empty = () => <p className={cn('text-sm italic', MUTED)}>Sin respuesta.</p>

function Label({ children }) {
  return <p className={cn('text-xs font-semibold uppercase tracking-wide', MUTED)}>{children}</p>
}

function Given({ text, ok }) {
  return (
    <div className="flex items-start gap-2 rounded-md bg-[hsl(var(--muted)/0.6)] px-3 py-2 text-sm">
      <Mark ok={ok} /><span className="min-w-0 flex-1 whitespace-pre-wrap">{text}</span>
    </div>
  )
}

function OptionLine({ option, selected }) {
  const known = typeof option.correct === 'boolean'
  const Icon = known && option.correct ? CheckCircle2 : known && selected ? XCircle : selected ? CircleDot : Circle
  const tone = known && option.correct ? OK : known && selected ? BAD : MUTED
  return (
    <li className={cn('flex items-start gap-2.5 rounded-md px-3 py-2 text-sm', selected && 'bg-[hsl(var(--muted))] font-medium')}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', tone)} aria-hidden="true" />
      <span className="min-w-0 flex-1">{option.text}</span>
      {selected ? <span className={cn('shrink-0 text-xs font-normal', MUTED)}>Respuesta elegida</span> : null}
    </li>
  )
}

// The learner's answer to one question and, when revealed, the correct one.
export function AnswerReview({ question, answer }) {
  const revealed = typeof question.correct === 'boolean' || question.awardedPoints !== undefined
  switch (question.kind) {
    case 'open':
      return answer?.text?.trim() ? <Given text={answer.text} /> : <Empty />
    case 'short': {
      const accepted = question.accepted
      return (
        <div className="space-y-2">
          {answer?.text?.trim() ? <Given text={answer.text} ok={revealed ? question.correct : null} /> : <Empty />}
          {accepted?.length ? <p className="text-sm"><span className={MUTED}>Respuestas aceptadas: </span>{accepted.join(' · ')}</p> : null}
        </div>
      )
    }
    case 'numeric': {
      const correct = numericAnswerText(question)
      return (
        <div className="space-y-2">
          {String(answer?.value ?? '').trim() ? <Given text={answer.value} ok={revealed ? question.correct : null} /> : <Empty />}
          {correct ? <p className="text-sm"><span className={MUTED}>Respuesta correcta: </span>{correct}</p> : null}
        </div>
      )
    }
    case 'ordering': {
      const rows = orderingRows(question, answer)
      const showCorrect = rows.some((row) => row.ok === false)
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1">
            <Label>{answer?.order?.length ? 'Tu orden' : 'Orden enviado (sin cambios)'}</Label>
            <ol className="space-y-1">
              {rows.map((row, i) => (
                <li key={row.id} className="flex items-start gap-2 rounded-md bg-[hsl(var(--muted)/0.6)] px-3 py-1.5 text-sm">
                  <span className={cn('w-5 shrink-0 tabular-nums', MUTED)}>{i + 1}.</span><span className="min-w-0 flex-1">{row.text}</span><Mark ok={row.ok} />
                </li>
              ))}
            </ol>
          </div>
          {showCorrect ? (
            <div className="space-y-1">
              <Label>Orden correcto</Label>
              <ol className="space-y-1">
                {rows.map((row, i) => <li key={row.id} className="flex gap-2 px-3 py-1.5 text-sm"><span className={cn('w-5 shrink-0 tabular-nums', MUTED)}>{i + 1}.</span>{row.correctText}</li>)}
              </ol>
            </div>
          ) : null}
        </div>
      )
    }
    case 'matching':
      return (
        <ul className="space-y-1">
          {matchingRows(question, answer).map((row) => (
            <li key={row.id} className="flex flex-wrap items-start gap-x-2 gap-y-0.5 rounded-md bg-[hsl(var(--muted)/0.6)] px-3 py-2 text-sm">
              <Mark ok={row.ok} />
              <span className="font-medium">{row.left}</span>
              <span className={MUTED}>→</span>
              <span>{row.given ?? <em className={MUTED}>Sin respuesta</em>}</span>
              {row.ok === false ? <span className={cn('basis-full pl-6 text-xs', MUTED)}>Correcta: {row.correct}</span> : null}
            </li>
          ))}
        </ul>
      )
    case 'fill_blank':
      return (
        <ol className="space-y-1">
          {blankRows(question, answer).map((row, i) => (
            <li key={i} className="flex flex-wrap items-start gap-x-2 gap-y-0.5 rounded-md bg-[hsl(var(--muted)/0.6)] px-3 py-2 text-sm">
              <Mark ok={row.ok} />
              <span className={cn('tabular-nums', MUTED)}>Espacio {i + 1}:</span>
              <span>{row.given.trim() ? row.given : <em className={MUTED}>Sin respuesta</em>}</span>
              {row.ok === false && row.accepted ? <span className={cn('basis-full pl-6 text-xs', MUTED)}>Correcta: {row.accepted.join(' · ')}</span> : null}
            </li>
          ))}
        </ol>
      )
    default: {
      const selected = new Set(answer?.optionIds ?? [])
      return <ul className="space-y-1">{(question.options ?? []).map((option) => <OptionLine key={option.id} option={option} selected={selected.has(option.id)} />)}</ul>
    }
  }
}
