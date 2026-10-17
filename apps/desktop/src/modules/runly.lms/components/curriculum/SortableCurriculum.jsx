import { useEffect, useRef, useState } from 'react'
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCorners, useDroppable, useSensor, useSensors,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@runly/ui'
import {
  applyDrop, containerDndId, lessonDndId, moveLessonAcross, parseDndId, sameCurriculumOrder, sectionDndId,
} from '../../lib/curriculumDnd.js'

const SCREEN_READER = {
  draggable: 'Para tomar un elemento presiona espacio o Enter. Muévelo con las flechas y presiona espacio o Enter para soltarlo, o Escape para cancelar.',
}

// A section drags among sections; a lesson drags among lessons and empty sections.
function collisionDetection(args) {
  const activeType = parseDndId(args.active?.id).type
  const droppableContainers = args.droppableContainers.filter((container) => {
    const type = parseDndId(container.id).type
    return activeType === 'section' ? type === 'section' : type === 'lesson' || type === 'container'
  })
  return closestCorners({ ...args, droppableContainers })
}

function sortableStyle(transform, transition) {
  return { transform: CSS.Translate.toString(transform), transition }
}

function SortableLesson({ lesson, disabled, renderLesson }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: lessonDndId(lesson.id), disabled })
  const handleProps = disabled ? null : { ...attributes, ...listeners, ref: setActivatorNodeRef }
  return (
    <li ref={setNodeRef} style={sortableStyle(transform, transition)} className={cn(isDragging && 'opacity-40')}>
      {renderLesson({ lesson, handleProps, isDragging, overlay: false })}
    </li>
  )
}

function EmptyDropZone({ sectionId, disabled, children }) {
  const { setNodeRef, isOver } = useDroppable({ id: containerDndId(sectionId), disabled })
  return (
    <div
      ref={setNodeRef}
      className={cn(
        'rounded-md border-2 border-dashed border-[hsl(var(--border))] transition-colors motion-reduce:transition-none',
        isOver && 'border-violet-500/60 bg-violet-500/5',
      )}
    >
      {children}
    </div>
  )
}

function SortableSection({ section, index, disabled, renderSection, renderLesson, renderEmpty, listClassName }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({ id: sectionDndId(section.id), disabled })
  const handleProps = disabled ? null : { ...attributes, ...listeners, ref: setActivatorNodeRef }
  const lessons = section.lessons ?? []
  const lessonList = lessons.length ? (
    <SortableContext items={lessons.map((lesson) => lessonDndId(lesson.id))} strategy={verticalListSortingStrategy}>
      <ul className={listClassName}>
        {lessons.map((lesson) => <SortableLesson key={lesson.id} lesson={lesson} disabled={disabled} renderLesson={renderLesson} />)}
      </ul>
    </SortableContext>
  ) : (
    <EmptyDropZone sectionId={section.id} disabled={disabled}>{renderEmpty(section)}</EmptyDropZone>
  )
  return (
    <div ref={setNodeRef} style={sortableStyle(transform, transition)} className={cn(isDragging && 'opacity-40')}>
      {renderSection({ section, index, handleProps, isDragging, overlay: false, lessons: lessonList })}
    </div>
  )
}

// Curriculum with drag and drop: sections reorder, lessons reorder inside a
// section and move between sections (also into an empty one). Pointer and
// keyboard (space/Enter, arrows, Escape) both work. `onReorder(sections)` runs
// once per drop, only when the order changed. Render props:
//   renderSection({ section, index, handleProps, overlay, lessons }) — must place `lessons`.
//   renderLesson({ lesson, handleProps, isDragging, overlay })
//   renderEmpty(section) — content of the drop zone of a section without lessons.
// `handleProps` is null when sorting is disabled; spread it on the grip button.
// `listClassName` styles the lesson list of each section.
export function SortableCurriculum({ sections, onReorder, disabled = false, renderSection, renderLesson, renderEmpty, className, listClassName = 'space-y-0.5' }) {
  const [items, setItems] = useState(sections ?? [])
  const [activeId, setActiveId] = useState(null)
  const dragging = useRef(false)
  const snapshot = useRef(null)
  // New server data (or an optimistic rollback) replaces the local order,
  // except in the middle of a drag.
  useEffect(() => { if (!dragging.current) setItems(sections ?? []) }, [sections])

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const titleOf = (dndId) => {
    const { type, id } = parseDndId(dndId)
    if (type === 'lesson') return `la lección «${items.flatMap((s) => s.lessons ?? []).find((l) => l.id === id)?.title ?? ''}»`
    return `la sección «${items.find((s) => s.id === id)?.title ?? ''}»`
  }
  const announcements = {
    onDragStart: ({ active }) => `Tomaste ${titleOf(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${titleOf(active.id)} está sobre ${titleOf(over.id)}.` : `${titleOf(active.id)} no está sobre un lugar válido.`),
    onDragEnd: ({ active, over }) => (over ? `Soltaste ${titleOf(active.id)} en ${titleOf(over.id)}.` : `Soltaste ${titleOf(active.id)}.`),
    onDragCancel: ({ active }) => `Se canceló el movimiento de ${titleOf(active.id)}.`,
  }

  function finish() {
    dragging.current = false
    snapshot.current = null
    setActiveId(null)
  }

  function onDragStart({ active }) {
    dragging.current = true
    snapshot.current = items
    setActiveId(active.id)
  }

  function onDragOver({ active, over }) {
    if (!over || parseDndId(active.id).type !== 'lesson') return
    setItems((current) => moveLessonAcross(current, parseDndId(active.id).id, over.id))
  }

  function onDragEnd({ active, over }) {
    const original = snapshot.current
    const next = over ? applyDrop(items, active.id, over.id) : items
    finish()
    setItems(next)
    if (original && !sameCurriculumOrder(next, original)) onReorder?.(next)
  }

  function onDragCancel() {
    const original = snapshot.current
    finish()
    if (original) setItems(original)
  }

  const active = parseDndId(activeId)
  const activeSection = active.type === 'section' ? items.find((section) => section.id === active.id) : null
  const activeLesson = active.type === 'lesson' ? items.flatMap((section) => section.lessons ?? []).find((lesson) => lesson.id === active.id) : null

  return (
    <DndContext
      sensors={sensors} collisionDetection={collisionDetection} accessibility={{ announcements, screenReaderInstructions: SCREEN_READER }}
      onDragStart={onDragStart} onDragOver={onDragOver} onDragEnd={onDragEnd} onDragCancel={onDragCancel}
    >
      <SortableContext items={items.map((section) => sectionDndId(section.id))} strategy={verticalListSortingStrategy}>
        <div className={className}>
          {items.map((section, index) => (
            <SortableSection
              key={section.id} section={section} index={index} disabled={disabled}
              renderSection={renderSection} renderLesson={renderLesson} renderEmpty={renderEmpty} listClassName={listClassName}
            />
          ))}
        </div>
      </SortableContext>
      <DragOverlay>
        {activeLesson ? renderLesson({ lesson: activeLesson, handleProps: null, isDragging: true, overlay: true }) : null}
        {activeSection ? renderSection({ section: activeSection, index: items.indexOf(activeSection), handleProps: null, overlay: true, lessons: null }) : null}
      </DragOverlay>
    </DndContext>
  )
}
