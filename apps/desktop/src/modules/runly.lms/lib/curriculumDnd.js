// Pure helpers for the curriculum drag and drop (sections and lessons).
// dnd-kit ids are prefixed so a section and a lesson can never collide:
// "s:<sectionId>", "l:<lessonId>" and "c:<sectionId>" for the drop zone of an
// empty section.

export const sectionDndId = (id) => `s:${id}`
export const lessonDndId = (id) => `l:${id}`
export const containerDndId = (id) => `c:${id}`

const TYPES = { s: 'section', l: 'lesson', c: 'container' }

export function parseDndId(value) {
  const text = String(value ?? '')
  const type = TYPES[text.slice(0, 1)]
  if (!type || text[1] !== ':') return { type: null, id: null }
  return { type, id: text.slice(2) }
}

const clone = (sections) => (sections ?? []).map((section) => ({ ...section, lessons: [...(section.lessons ?? [])] }))

const sectionIndexOfLesson = (sections, lessonId) => sections.findIndex((section) => section.lessons.some((lesson) => lesson.id === lessonId))

// Section that holds a drop target (a lesson, a section or an empty-section zone).
export function sectionIdOf(sections, dndId) {
  const { type, id } = parseDndId(dndId)
  if (type === 'section' || type === 'container') return id
  if (type === 'lesson') return (sections ?? []).find((section) => (section.lessons ?? []).some((lesson) => lesson.id === id))?.id ?? null
  return null
}

// While dragging a lesson over another section, move it there: before the
// lesson it hovers, or at the end when it hovers the section itself.
// Returns the same array when nothing changes.
export function moveLessonAcross(sections, lessonId, overDndId) {
  const targetSectionId = sectionIdOf(sections, overDndId)
  const from = sectionIndexOfLesson(clone(sections), lessonId)
  if (from < 0 || !targetSectionId || sections[from].id === targetSectionId) return sections
  const next = clone(sections)
  const to = next.findIndex((section) => section.id === targetSectionId)
  if (to < 0) return sections
  const source = next[from].lessons
  const [lesson] = source.splice(source.findIndex((item) => item.id === lessonId), 1)
  const over = parseDndId(overDndId)
  const overIndex = over.type === 'lesson' ? next[to].lessons.findIndex((item) => item.id === over.id) : -1
  next[to].lessons.splice(overIndex < 0 ? next[to].lessons.length : overIndex, 0, { ...lesson, sectionId: targetSectionId })
  return next
}

function arrayMove(list, from, to) {
  const next = [...list]
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

// Drop: reorders sections, or a lesson inside its (current) section.
export function applyDrop(sections, activeDndId, overDndId) {
  const active = parseDndId(activeDndId), over = parseDndId(overDndId)
  if (!active.type || !over.type || activeDndId === overDndId) return sections
  if (active.type === 'section') {
    const targetId = over.type === 'section' ? over.id : sectionIdOf(sections, overDndId)
    const from = sections.findIndex((section) => section.id === active.id)
    const to = sections.findIndex((section) => section.id === targetId)
    return from < 0 || to < 0 || from === to ? sections : arrayMove(sections, from, to)
  }
  if (active.type !== 'lesson' || over.type !== 'lesson') return sections
  const sIndex = sectionIndexOfLesson(sections, active.id)
  if (sIndex < 0) return sections
  const lessons = sections[sIndex].lessons
  const from = lessons.findIndex((lesson) => lesson.id === active.id)
  const to = lessons.findIndex((lesson) => lesson.id === over.id)
  if (to < 0 || from === to) return sections
  return sections.map((section, index) => (index === sIndex ? { ...section, lessons: arrayMove(lessons, from, to) } : section))
}

// Same section order and the same lessons in each section.
export function sameCurriculumOrder(a, b) {
  const key = (sections) => (sections ?? []).map((section) => `${section.id}:${(section.lessons ?? []).map((lesson) => lesson.id).join(',')}`).join('|')
  return key(a) === key(b)
}

// Optimistic cache value: every lesson points at the section that now holds it.
export const withSectionIds = (sections) => (sections ?? []).map((section) => ({
  ...section,
  lessons: (section.lessons ?? []).map((lesson) => (lesson.sectionId === section.id ? lesson : { ...lesson, sectionId: section.id })),
}))
