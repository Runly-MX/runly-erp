import { Button, cn } from '@runly/ui'
import { Plus } from 'lucide-react'
import { useReorder } from '../../hooks/useLmsData.js'
import { DragHandle } from './DragHandle.jsx'
import { lessonIcon, lessonMeta } from './lessonKind.js'
import { SortableCurriculum } from './SortableCurriculum.jsx'

function NavLesson({ lesson, handleProps, overlay, active, onSelect }) {
  const Icon = lessonIcon(lesson.kind)
  return (
    <div className={cn('flex items-center gap-1 rounded-md', active ? 'bg-[hsl(var(--muted))]' : 'hover:bg-[hsl(var(--muted)/0.6)]', overlay && 'bg-[hsl(var(--card))] shadow-lg')}>
      <DragHandle handleProps={handleProps} overlay={overlay} label={`Mover la lección «${lesson.title}»`} />
      <button
        type="button" onClick={() => onSelect(lesson.id)} aria-current={active ? 'page' : undefined}
        className={cn('flex min-w-0 flex-1 items-start gap-2 rounded-md py-1.5 pr-2 text-left text-sm focus-visible:outline-none focus-visible:bg-[hsl(var(--muted))]', !handleProps && !overlay && 'pl-2', active && 'font-medium')}
      >
        <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate leading-snug">{lesson.title}</span>
          <span className="block text-xs font-normal text-[hsl(var(--muted-foreground))]">{lessonMeta(lesson)}</span>
        </span>
      </button>
    </div>
  )
}

// Left column of the lesson editor: the whole curriculum with drag and drop.
// The current lesson is a flat fill. `onSelect` / `onAdd` go through the
// editor's unsaved-changes guard.
export function CourseCurriculumNav({ courseId, sections, currentLessonId, onSelect, onAdd, readOnly = false }) {
  const reorder = useReorder()
  return (
    <nav aria-label="Contenido del curso">
      <SortableCurriculum
        sections={sections} disabled={readOnly} className="space-y-4"
        onReorder={(next) => reorder.mutate({ courseId, sections: next })}
        renderSection={({ section, index, handleProps, overlay, lessons }) => (
          <div className={cn('space-y-1', overlay && 'rounded-md bg-[hsl(var(--card))] p-1 shadow-lg')}>
            <div className="flex items-center gap-1">
              <DragHandle handleProps={handleProps} overlay={overlay} label={`Mover la sección «${section.title}»`} />
              <p className={cn('min-w-0 flex-1 truncate text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]', !handleProps && !overlay && 'px-2')}>
                {index + 1}. {section.title}
              </p>
              {lessons && !readOnly ? (
                <Button type="button" variant="ghost" size="icon-sm" aria-label={`Agregar lección en «${section.title}»`} title="Agregar lección" onClick={() => onAdd(section.id)}>
                  <Plus />
                </Button>
              ) : null}
            </div>
            {lessons}
          </div>
        )}
        renderLesson={({ lesson, handleProps, overlay }) => (
          <NavLesson lesson={lesson} handleProps={handleProps} overlay={overlay} active={!overlay && lesson.id === currentLessonId} onSelect={onSelect} />
        )}
        renderEmpty={() => <p className="px-2 py-2 text-xs text-[hsl(var(--muted-foreground))]">Sin lecciones.</p>}
      />
    </nav>
  )
}
