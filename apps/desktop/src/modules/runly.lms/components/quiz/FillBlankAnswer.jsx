import { Fragment } from 'react'
import { Input } from '@runly/ui'

// Fill-in-the-blank question: the prompt text with an input at each blank.
// `parts` is the text around the blanks (n blanks -> n + 1 parts).
export function FillBlankAnswer({ question, answer, onAnswer, disabled, index }) {
  const parts = question.parts ?? [question.prompt ?? '']
  const values = Array.isArray(answer?.blanks) ? answer.blanks : []
  const count = Math.max(0, parts.length - 1)
  const set = (i, text) => {
    const next = Array.from({ length: count }, (_, k) => values[k] ?? '')
    next[i] = text
    onAnswer({ blanks: next })
  }
  return (
    <p className="whitespace-pre-wrap text-[15px] leading-9">
      {parts.map((text, i) => (
        <Fragment key={i}>
          {text}
          {i < count ? (
            <Input
              aria-label={`Espacio ${i + 1} de la pregunta ${index + 1}`} value={values[i] ?? ''} maxLength={200} disabled={disabled} autoComplete="off"
              onChange={(event) => set(i, event.target.value)}
              className="mx-1 inline-flex h-8 w-40 max-w-full align-middle"
              placeholder={`(${i + 1})`}
            />
          ) : null}
        </Fragment>
      ))}
    </p>
  )
}
