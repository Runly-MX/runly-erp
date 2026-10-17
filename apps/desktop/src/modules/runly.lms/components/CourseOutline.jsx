import { useState } from 'react'
import { ProgressBar, cn } from '@runly/ui'
import { ChevronDown, Clock, ListVideo, XCircle } from 'lucide-react'
import { KIND_LABELS, formatDuration } from '../lib/lmsLabels.js'
import { lessonCountLabel, sectionSeconds } from '../lib/lmsExperience.js'
import { LessonThumb } from './LessonThumb.jsx'

const STATE_NOTES = {
  pending_review: { icon: Clock, className: 'text-amber-700 dark:text-amber-300', label: 'En revisión' },
  failed: { icon: XCircle, className: 'text-[hsl(var(--destructive))]', label: 'No aprobada' },
}

function LessonRow({ lesson, active, onSelect }) {
  const locked = lesson.status === 'locked'
  const completed = lesson.status === 'completed'
  const note = STATE_NOTES[lesson.status]
  const meta = [KIND_LABELS[lesson.kind], lesson.required === false ? 'Opcional' : null].filter(Boolean).join(' · ')
  return (
    <li>
      <button
        type="button"
        disabled={locked}
        aria-current={active ? 'true' : undefined}
        title={locked ? 'Completa las lecciones anteriores para abrir esta.' : undefined}
        onClick={() => onSelect(lesson.id)}
        className={cn(
          'flex w-full items-start gap-3 rounded-md p-2 text-left transition-colors motion-reduce:transition-none',
          'focus-visible:outline-none focus-visible:bg-[hsl(var(--muted))]',
          active ? 'bg-[hsl(var(--muted))]' : 'hover:bg-[hsl(var(--muted)/0.6)]',
          locked && 'cursor-not-allowed hover:bg-transparent',
        )}
      >
        <LessonThumb lesson={lesson} locked={locked} completed={completed} className="w-28" />
        <span className="flex min-w-0 flex-1 flex-col gap-0.5 py-0.5">
          <span className={cn('line-clamp-2 text-sm leading-snug', active ? 'font-semibold' : 'font-medium', locked && 'text-[hsl(var(--muted-foreground))]')}>
            {lesson.title}
          </span>
          {meta ? <span className="text-xs text-[hsl(var(--muted-foreground))]">{meta}</span> : null}
          {note ? (
            <span className={cn('inline-flex items-center gap-1 text-xs font-medium', note.className)}>
              <note.icon className="h-3.5 w-3.5" aria-hidden="true" />{note.label}
            </span>
          ) : null}
          {active ? <span className="sr-only">Lección actual</span> : null}
        </span>
      </button>
    </li>
  )
}

function SectionBlock({ section, index, open, onToggle, currentLessonId, onSelect }) {
  const lessons = section.lessons ?? []
  const done = lessons.filter((lesson) => lesson.status === 'completed').length
  const duration = formatDuration(sectionSeconds(section))
  const panelId = `lms-outline-${section.id}`
  return (
    <div className="overflow-hidden rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={onToggle}
        className="flex w-full items-center gap-3 bg-[hsl(var(--muted)/0.5)] px-3 py-2.5 text-left transition-colors hover:bg-[hsl(var(--muted))] focus-visible:outline-none focus-visible:bg-[hsl(var(--muted))] motion-reduce:transition-none"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{index + 1}. {section.title}</span>
          <span className="block text-xs text-[hsl(var(--muted-foreground))]">
            {done}/{lessons.length} completadas{duration ? ` · ${duration}` : ''}
          </span>
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform duration-200 motion-reduce:transition-none', !open && '-rotate-90')} aria-hidden="true" />
      </button>
      {/* grid-rows 0fr -> 1fr animates the height without measuring it. */}
      <div
        id={panelId}
        className={cn('grid transition-[grid-template-rows] duration-200 ease-out motion-reduce:transition-none', open ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]')}
        inert={!open}
      >
        <div className="min-h-0 overflow-hidden">
          <ul className="space-y-0.5 p-1.5">
            {lessons.map((lesson) => <LessonRow key={lesson.id} lesson={lesson} active={lesson.id === currentLessonId} onSelect={onSelect} />)}
            {!lessons.length ? <li className="px-2 py-3 text-xs text-[hsl(var(--muted-foreground))]">Sin lecciones.</li> : null}
          </ul>
        </div>
      </div>
    </div>
  )
}

// Content sidebar of the player: collapsible sections with 16:9 thumbnails,
// lock overlay, completed check and duration. The current lesson is a flat fill.
export function CourseOutline({ sections, currentLessonId, onSelect, progressPct = null, className }) {
  const [collapsed, setCollapsed] = useState(() => new Set())
  const list = sections ?? []
  const total = list.reduce((sum, section) => sum + (section.lessons?.length ?? 0), 0)
  const toggle = (id) => setCollapsed((current) => {
    const next = new Set(current)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })
  return (
    <nav aria-label="Contenido del curso" className={cn('space-y-3', className)}>
      <div className="space-y-2 px-1">
        <div className="flex items-center justify-between gap-2">
          <p className="inline-flex items-center gap-2 text-sm font-semibold"><ListVideo className="h-4 w-4 text-violet-600 dark:text-violet-400" aria-hidden="true" />Contenido del curso</p>
          <span className="text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{lessonCountLabel(total)}</span>
        </div>
        {progressPct !== null ? (
          <div className="flex items-center gap-2">
            <ProgressBar value={progressPct} className="h-1.5 flex-1" aria-label={`Avance del curso: ${progressPct}%`} />
            <span className="text-xs font-medium tabular-nums">{progressPct}%</span>
          </div>
        ) : null}
      </div>
      {list.map((section, index) => (
        <SectionBlock
          key={section.id} section={section} index={index} open={!collapsed.has(section.id)}
          onToggle={() => toggle(section.id)} currentLessonId={currentLessonId} onSelect={onSelect}
        />
      ))}
    </nav>
  )
}
