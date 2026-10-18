import { SelectField } from '@runly/ui'

// Matching question: one select per left item with the (shuffled) right column.
export function MatchingAnswer({ question, answer, onAnswer, disabled }) {
  const pairs = answer?.pairs ?? {}
  const choices = (question.choices ?? []).map((choice) => ({ value: choice.id, label: choice.text }))
  const used = new Set(Object.values(pairs))
  return (
    <div className="space-y-2">
      <p className="text-xs text-[hsl(var(--muted-foreground))]">Elige la pareja de cada elemento.</p>
      <ul className="space-y-2">
        {(question.options ?? []).map((left, index) => (
          <li key={left.id} className="rounded-md border border-[hsl(var(--border))] p-2.5">
            <SelectField
              label={`${index + 1}. ${left.text}`} placeholder="Elige su pareja…" disabled={disabled}
              options={choices.map((choice) => ({ ...choice, label: used.has(choice.value) && pairs[left.id] !== choice.value ? `${choice.label} (ya usada)` : choice.label }))}
              value={pairs[left.id] ?? ''}
              onValueChange={(value) => onAnswer({ pairs: { ...pairs, [left.id]: value } })}
            />
          </li>
        ))}
      </ul>
    </div>
  )
}
