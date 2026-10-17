import { cn } from '@runly/ui'
import { CheckCircle2, Lock } from 'lucide-react'
import { formatClock, kindTone } from '../lib/lmsExperience.js'
import { lessonIcon } from './curriculum/lessonKind.js'

// 16:9 lesson thumbnail: the cover when there is one, else a gradient tinted by
// kind with its icon. Optional overlays: lock, completed check and duration.
export function LessonThumb({ lesson, locked = false, completed = false, showDuration = true, className }) {
  const Icon = lessonIcon(lesson?.kind)
  const clock = showDuration ? formatClock(lesson?.durationSeconds) : ''
  return (
    <div className={cn('relative aspect-video shrink-0 overflow-hidden rounded-md bg-[hsl(var(--muted))]', className)}>
      {lesson?.coverUrl ? (
        <img src={lesson.coverUrl} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
      ) : (
        <div className={cn('flex h-full w-full items-center justify-center bg-linear-to-br', kindTone(lesson?.kind))}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      )}
      {locked ? (
        <div className="absolute inset-0 flex items-center justify-center bg-black/55">
          <Lock className="h-4 w-4 text-white" aria-hidden="true" />
        </div>
      ) : null}
      {completed ? (
        <span className="absolute right-1 top-1 flex rounded-full bg-white dark:bg-zinc-900">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" aria-hidden="true" />
        </span>
      ) : null}
      {clock ? (
        <span className="absolute bottom-1 right-1 rounded-sm bg-black/75 px-1 py-px text-[10px] font-medium tabular-nums leading-tight text-white">{clock}</span>
      ) : null}
    </div>
  )
}
