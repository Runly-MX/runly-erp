import { cn } from '@runly/ui'
import { CheckCircle2, Circle, Clock, Lock, PlayCircle, XCircle } from 'lucide-react'
import { KIND_LABELS, formatDuration } from '../lib/lmsLabels.js'

const STATE_ICONS = {
  completed: { icon: CheckCircle2, className: 'text-emerald-600 dark:text-emerald-400', label: 'Completada' },
  in_progress: { icon: PlayCircle, className: 'text-violet-600 dark:text-violet-400', label: 'En curso' },
  available: { icon: Circle, className: 'text-[hsl(var(--muted-foreground))]', label: 'Disponible' },
  pending_review: { icon: Clock, className: 'text-amber-600 dark:text-amber-400', label: 'En revisión' },
  failed: { icon: XCircle, className: 'text-[hsl(var(--destructive))]', label: 'No aprobada' },
  locked: { icon: Lock, className: 'text-[hsl(var(--muted-foreground))]', label: 'Bloqueada' },
}

// Sections and lessons of the player. The current lesson is a flat fill; a
// locked lesson is disabled until the earlier required ones are completed.
export function CourseOutline({ sections, currentLessonId, onSelect }) {
  return (
    <nav aria-label="Contenido del curso" className="space-y-4">
      {(sections ?? []).map((section, index) => (
        <div key={section.id} className="space-y-1">
          <p className="px-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
            {index + 1}. {section.title}
          </p>
          <ul className="space-y-0.5">
            {(section.lessons ?? []).map((lesson) => {
              const state = STATE_ICONS[lesson.status] ?? STATE_ICONS.available
              const Icon = state.icon
              const active = lesson.id === currentLessonId
              const locked = lesson.status === 'locked'
              const meta = [KIND_LABELS[lesson.kind], formatDuration(lesson.durationSeconds), lesson.required === false ? 'Opcional' : null].filter(Boolean).join(' · ')
              return (
                <li key={lesson.id}>
                  <button
                    type="button"
                    disabled={locked}
                    aria-current={active ? 'true' : undefined}
                    onClick={() => onSelect(lesson.id)}
                    className={cn(
                      'flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors',
                      'focus-visible:outline-none focus-visible:bg-[hsl(var(--muted))]',
                      active ? 'bg-[hsl(var(--muted))] font-medium' : 'hover:bg-[hsl(var(--muted)/0.6)]',
                      locked && 'cursor-not-allowed opacity-60 hover:bg-transparent',
                    )}
                  >
                    <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', state.className)} aria-label={state.label} />
                    <span className="min-w-0 flex-1">
                      <span className="block leading-snug">{lesson.title}</span>
                      {meta ? <span className="block text-xs font-normal text-[hsl(var(--muted-foreground))]">{meta}</span> : null}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}
