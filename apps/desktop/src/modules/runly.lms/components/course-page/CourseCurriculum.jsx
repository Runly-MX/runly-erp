import { useState } from 'react'
import { Badge, Button, cn } from '@runly/ui'
import { ChevronDown, PlayCircle } from 'lucide-react'
import { KIND_LABELS, formatDuration } from '../../lib/lmsLabels.js'
import { initialOpenSections, lessonCountLabel, sectionSeconds } from '../../lib/lmsExperience.js'
import { LessonThumb } from '../LessonThumb.jsx'

function LessonLine({ lesson, onOpen }) {
  const free = lesson.free === true
  const meta = [KIND_LABELS[lesson.kind], formatDuration(lesson.durationSeconds), lesson.required === false ? 'Opcional' : null].filter(Boolean).join(' · ')
  const content = (
    <>
      <LessonThumb lesson={lesson} className="w-24" showDuration={false} />
      <span className="min-w-0 flex-1">
        <span className="flex items-start gap-2">
          <span className="line-clamp-2 text-sm font-medium leading-snug">{lesson.title}</span>
          {free ? <Badge variant="success" className="shrink-0">Gratis</Badge> : null}
        </span>
        <span className="block text-xs text-[hsl(var(--muted-foreground))]">{meta}</span>
      </span>
      {onOpen ? <PlayCircle className="h-5 w-5 shrink-0 text-violet-600 opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none dark:text-violet-400" aria-hidden="true" /> : null}
    </>
  )
  const base = 'group flex w-full items-center gap-3 rounded-md p-2 text-left'
  return (
    <li>
      {onOpen ? (
        <button type="button" onClick={() => onOpen(lesson.id)} className={cn(base, 'transition-colors hover:bg-[hsl(var(--muted)/0.6)] focus-visible:outline-none focus-visible:bg-[hsl(var(--muted))] motion-reduce:transition-none')}>
          {content}
        </button>
      ) : <div className={base}>{content}</div>}
    </li>
  )
}

// Accordion curriculum of the course page: sections with lesson count and
// duration; lessons with thumbnail, kind and duration. `onOpenLesson` opens the
// player on a lesson; `canOpen(lesson)` limits it (not enrolled: only free
// lessons, played as a free preview). Free lessons show a "Gratis" badge.
export function CourseCurriculum({ sections, onOpenLesson = null, canOpen = () => true }) {
  const list = sections ?? []
  const [open, setOpen] = useState(() => new Set(initialOpenSections(list)))
  const allOpen = list.length > 0 && list.every((section) => open.has(section.id))
  const toggle = (id) => setOpen((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  if (!list.length) return <p className="text-sm text-[hsl(var(--muted-foreground))]">Este curso aún no tiene contenido.</p>
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={() => setOpen(allOpen ? new Set() : new Set(list.map((section) => section.id)))}>
          {allOpen ? 'Contraer todo' : 'Expandir todo'}
        </Button>
      </div>
      <div className="divide-y divide-[hsl(var(--border))] overflow-hidden rounded-md border border-[hsl(var(--border))]">
        {list.map((section, index) => {
          const expanded = open.has(section.id)
          const duration = formatDuration(sectionSeconds(section))
          const panelId = `lms-curriculum-${section.id}`
          return (
            <section key={section.id}>
              <h3>
                <button
                  type="button" aria-expanded={expanded} aria-controls={panelId} onClick={() => toggle(section.id)}
                  className="flex w-full items-center gap-3 bg-[hsl(var(--muted)/0.5)] px-4 py-3 text-left transition-colors hover:bg-[hsl(var(--muted))] focus-visible:outline-none focus-visible:bg-[hsl(var(--muted))] motion-reduce:transition-none"
                >
                  <ChevronDown className={cn('h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform duration-200 motion-reduce:transition-none', !expanded && '-rotate-90')} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-semibold">{index + 1}. {section.title}</span>
                  <span className="shrink-0 text-xs text-[hsl(var(--muted-foreground))]">
                    {lessonCountLabel(section.lessons?.length ?? 0)}{duration ? ` · ${duration}` : ''}
                  </span>
                </button>
              </h3>
              <div id={panelId} inert={!expanded} className={cn('grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none', expanded ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}>
                <div className="min-h-0 overflow-hidden">
                  <ul className="space-y-0.5 p-2">
                    {(section.lessons ?? []).map((lesson) => <LessonLine key={lesson.id} lesson={lesson} onOpen={onOpenLesson && canOpen(lesson) ? onOpenLesson : null} />)}
                    {!section.lessons?.length ? <li className="px-2 py-1 text-xs text-[hsl(var(--muted-foreground))]">Sin lecciones.</li> : null}
                  </ul>
                </div>
              </div>
            </section>
          )
        })}
      </div>
    </div>
  )
}
