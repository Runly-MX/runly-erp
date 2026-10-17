import { useState } from 'react'
import { Button, StarRating } from '@runly/ui'
import { Star, X } from 'lucide-react'
import { dismissRatePrompt, isRatePromptDismissed } from '../../lib/lmsLabels.js'

// "Califica este curso": shown by the player when the learner can review and
// has not yet. Picking stars opens the reviews dialog with that rating;
// "Ahora no" hides it for this course (remembered in localStorage).
export function RateCoursePrompt({ courseId, completed = false, onRate }) {
  const [dismissed, setDismissed] = useState(() => isRatePromptDismissed(courseId))
  if (dismissed) return null

  function dismiss() {
    dismissRatePrompt(courseId)
    setDismissed(true)
  }

  return (
    <aside className="mx-auto mb-5 flex w-full max-w-4xl flex-col gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center" aria-label="Califica este curso">
      <span className="hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-700 sm:flex dark:text-amber-300">
        <Star className="h-4 w-4" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Califica este curso</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          {completed ? 'Terminaste el curso. Tu opinión ayuda a mejorarlo.' : 'Llevas buen avance. ¿Qué te está pareciendo?'}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <StarRating value={0} onChange={(rating) => onRate(rating)} size="md" label="Califica este curso" />
        <Button variant="ghost" size="sm" onClick={dismiss}><X />Ahora no</Button>
      </div>
    </aside>
  )
}
