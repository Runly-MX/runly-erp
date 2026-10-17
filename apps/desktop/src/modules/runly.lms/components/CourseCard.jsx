import { Badge, Button, ProgressBar, cn } from '@runly/ui'
import { BookOpen, Clock, GraduationCap } from 'lucide-react'
import { LEVEL_LABELS, dueLabel, formatMinutes, isOverdue } from '../lib/lmsLabels.js'

// Course tile for the learner home. `actionLabel` + `onAction` drive the
// single button (Continuar / Repasar / Inscribirme).
export function CourseCard({ course, enrollment, actionLabel, onAction, pending = false }) {
  const due = dueLabel(enrollment)
  const overdue = isOverdue(enrollment)
  const showProgress = enrollment && enrollment.status !== 'dropped'
  return (
    <article className="flex w-full flex-col overflow-hidden rounded-2xl surface-card">
      <div className="relative aspect-video w-full bg-violet-600/10">
        {course.coverUrl ? (
          <img src={course.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-violet-700 dark:text-violet-300">
            <GraduationCap className="h-10 w-10" aria-hidden="true" />
          </div>
        )}
        {due ? (
          <Badge variant={overdue ? 'destructive' : 'warning'} className="absolute left-3 top-3">{due}</Badge>
        ) : null}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0 space-y-1">
          {course.category ? <p className="truncate text-xs font-medium uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{course.category}</p> : null}
          <h3 className="line-clamp-2 text-base font-semibold leading-snug">{course.title}</h3>
          {course.summary ? <p className="line-clamp-2 text-sm text-[hsl(var(--muted-foreground))]">{course.summary}</p> : null}
        </div>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[hsl(var(--muted-foreground))]">
          {course.level ? <li>{LEVEL_LABELS[course.level] ?? course.level}</li> : null}
          <li className="inline-flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" aria-hidden="true" />{course.lessonCount ?? 0} {course.lessonCount === 1 ? 'lección' : 'lecciones'}</li>
          {course.estimatedMinutes ? <li className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{formatMinutes(course.estimatedMinutes)}</li> : null}
        </ul>
        <div className="mt-auto space-y-3">
          {showProgress ? (
            <div className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className="text-[hsl(var(--muted-foreground))]">Avance</span>
                <span className="font-medium tabular-nums">{enrollment.progressPct ?? 0}%</span>
              </div>
              <ProgressBar value={enrollment.progressPct ?? 0} barClassName={cn(enrollment.status === 'completed' && 'bg-emerald-600')} />
            </div>
          ) : null}
          {onAction ? (
            <Button className="w-full" variant={enrollment?.status === 'completed' ? 'outline' : 'default'} onClick={onAction} disabled={pending}>
              {actionLabel}
            </Button>
          ) : null}
        </div>
      </div>
    </article>
  )
}
