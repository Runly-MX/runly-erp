import { Badge, Button, cn } from '@runly/ui'
import { BookOpen, Clock, GraduationCap, Star } from 'lucide-react'
import { LEVEL_LABELS, dueLabel, formatMinutes, formatRating, isOverdue } from '../lib/lmsLabels.js'
import { lessonCountLabel } from '../lib/lmsExperience.js'

// Image-filled course tile (racoon-lms CourseCard): the cover fills the card,
// a dark gradient carries the text. The whole card opens the course page
// (`onOpen`); the single button (`actionLabel` + `onAction`) goes straight to
// the player or enrolls.
export function CourseCard({ course, enrollment, actionLabel, onAction, onOpen, pending = false }) {
  const due = dueLabel(enrollment)
  const overdue = isOverdue(enrollment)
  const showProgress = enrollment && enrollment.status !== 'dropped'
  const pct = enrollment?.progressPct ?? 0
  const completed = enrollment?.status === 'completed'
  const rating = course.ratingCount ? formatRating(course.ratingAvg) : ''
  return (
    <article className="group relative isolate flex h-80 w-full flex-col overflow-hidden rounded-2xl bg-zinc-900 shadow-sm transition-shadow duration-300 hover:shadow-lg motion-reduce:transition-none">
      <div className="absolute inset-0 -z-10" aria-hidden="true">
        {course.coverUrl ? (
          <img
            src={course.coverUrl} alt="" loading="lazy" decoding="async"
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <div className="flex h-full w-full items-start justify-center bg-linear-to-br from-violet-600 via-purple-600 to-fuchsia-500 pt-14">
            <GraduationCap className="h-12 w-12 text-white/45" />
          </div>
        )}
        <div className="absolute inset-0 bg-linear-to-t from-black/95 via-black/60 to-black/5" />
      </div>

      {onOpen ? (
        <button
          type="button" onClick={onOpen} aria-label={`Ver el curso «${course.title}»`}
          className="absolute inset-0 z-0 cursor-pointer rounded-2xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-500"
        />
      ) : null}

      {due ? <Badge variant={overdue ? 'destructive' : 'warning'} className="absolute left-3 top-3 z-10">{due}</Badge> : null}

      <div className="pointer-events-none relative z-10 mt-auto flex flex-col gap-3 p-4 text-white">
        <div className="min-w-0 space-y-1">
          {course.category ? <p className="truncate text-xs font-semibold uppercase tracking-wide text-violet-200">{course.category}</p> : null}
          <h3 className="line-clamp-2 text-lg font-semibold leading-snug drop-shadow-sm">{course.title}</h3>
          {course.summary ? <p className="line-clamp-2 text-xs text-white/75">{course.summary}</p> : null}
        </div>
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-white/15 pt-3 text-xs text-white/80">
          {course.level ? <li>{LEVEL_LABELS[course.level] ?? course.level}</li> : null}
          <li className="inline-flex items-center gap-1"><BookOpen className="h-3.5 w-3.5" aria-hidden="true" />{lessonCountLabel(course.lessonCount ?? 0)}</li>
          {course.estimatedMinutes ? <li className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{formatMinutes(course.estimatedMinutes)}</li> : null}
          {rating ? (
            <li className="inline-flex items-center gap-1 font-semibold text-amber-300" aria-label={`Calificación ${rating} de 5`}>
              <Star className="h-3.5 w-3.5 fill-current" aria-hidden="true" />{rating}
              <span className="font-normal text-white/60">({course.ratingCount})</span>
            </li>
          ) : null}
        </ul>
        {showProgress ? (
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-white/70">{completed ? 'Completado' : 'Avance'}</span>
              <span className="font-semibold tabular-nums">{pct}%</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/20" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Avance del curso">
              <div className={cn('h-full rounded-full', completed ? 'bg-emerald-400' : 'bg-violet-400')} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
            </div>
          </div>
        ) : null}
        {onAction ? (
          <Button
            size="sm" onClick={onAction} disabled={pending}
            variant={completed ? 'outline' : 'default'}
            className={cn('pointer-events-auto w-full', completed && 'border-white/30 bg-white/10 text-white hover:bg-white/20 hover:text-white')}
          >
            {actionLabel}
          </Button>
        ) : null}
      </div>
    </article>
  )
}
