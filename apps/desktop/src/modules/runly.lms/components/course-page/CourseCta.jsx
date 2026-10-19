import { Button, ProgressBar, cn } from '@runly/ui'
import { Award, BookOpen, Clock, GraduationCap, Info, ListChecks, Loader2 } from 'lucide-react'
import { dueLabel, formatDuration, formatMinutes } from '../../lib/lmsLabels.js'
import { lessonCountLabel } from '../../lib/lmsExperience.js'

function Progress({ enrollment }) {
  if (!enrollment || enrollment.status === 'dropped') return null
  const pct = enrollment.progressPct ?? 0
  const due = dueLabel(enrollment)
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="text-[hsl(var(--muted-foreground))]">{enrollment.status === 'completed' ? 'Completado' : 'Tu avance'}</span>
        <span className="font-semibold tabular-nums">{pct}%</span>
      </div>
      <ProgressBar value={pct} barClassName={cn(enrollment.status === 'completed' && 'bg-emerald-600')} />
      {due ? <p className={cn('text-xs font-medium', enrollment.overdue ? 'text-[hsl(var(--destructive))]' : 'text-amber-700 dark:text-amber-300')}>{due}</p> : null}
    </div>
  )
}

// `cta` comes from lib courseCta; `onAction(action)` runs it.
function Actions({ cta, onAction, pending, className }) {
  return (
    <div className={cn('flex flex-col gap-2', className)}>
      <Button size="lg" className="w-full rounded-md" disabled={pending || cta.action === 'none'} onClick={() => onAction(cta.action)}>
        {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : cta.action === 'certificate' ? <Award /> : null}
        {cta.label}
      </Button>
      {cta.secondary ? <Button variant="outline" className="w-full" onClick={() => onAction(cta.secondary.action)}>{cta.secondary.label}</Button> : null}
    </div>
  )
}

// Sticky call-to-action card of the course page (desktop).
// cover=false when the hero already shows the cover or promo as a media card.
export function CourseCtaCard({ data, cta, onAction, pending, cover = true }) {
  const { course, counts, enrollment } = data
  const duration = counts.totalSeconds ? formatDuration(counts.totalSeconds) : formatMinutes(course.estimatedMinutes)
  const facts = [
    { icon: BookOpen, text: `${counts.sections} ${counts.sections === 1 ? 'sección' : 'secciones'} · ${lessonCountLabel(counts.lessons)}` },
    duration ? { icon: Clock, text: `${duration} de contenido` } : null,
    course.sequential ? { icon: ListChecks, text: 'Avance en orden: cada lección abre la siguiente' } : null,
    course.certificateTemplateId ? { icon: Award, text: 'Certificado al completar el curso' } : null,
  ].filter(Boolean)
  return (
    <div className="overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] shadow-xl">
      {cover ? (
        <div className="relative aspect-video w-full bg-[hsl(var(--muted))]">
          {course.heroUrl ? (
            <img src={course.heroUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-violet-600 via-purple-600 to-fuchsia-500">
              <GraduationCap className="h-12 w-12 text-white/50" aria-hidden="true" />
            </div>
          )}
        </div>
      ) : null}
      <div className="space-y-4 p-5">
        <Progress enrollment={enrollment} />
        <Actions cta={cta} onAction={onAction} pending={pending} />
        {cta.note ? <p className="flex gap-2 text-xs text-[hsl(var(--muted-foreground))]"><Info className="h-4 w-4 shrink-0" aria-hidden="true" />{cta.note}</p> : null}
        <ul className="space-y-2 border-t border-[hsl(var(--border))] pt-4 text-sm text-[hsl(var(--muted-foreground))]">
          {facts.map((fact) => (
            <li key={fact.text} className="flex items-start gap-2"><fact.icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />{fact.text}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

// Fixed bottom bar with the same action on phones and tablets.
export function CourseCtaBar({ data, cta, onAction, pending }) {
  const pct = data.enrollment && data.enrollment.status !== 'dropped' ? data.enrollment.progressPct ?? 0 : null
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[hsl(var(--border))] bg-[hsl(var(--background))]/95 px-4 pb-[calc(0.75rem+var(--sab))] pt-3 shadow-[0_-4px_16px_rgb(0_0_0/0.08)] backdrop-blur lg:hidden">
      <div className="mx-auto flex max-w-3xl items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{data.course.title}</p>
          <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{pct !== null ? `Avance: ${pct}%` : cta.note ?? lessonCountLabel(data.counts.lessons)}</p>
        </div>
        <Button className="shrink-0" disabled={pending || cta.action === 'none'} onClick={() => onAction(cta.action)}>
          {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
          {cta.label}
        </Button>
      </div>
    </div>
  )
}
