import { useState } from 'react'
import { Badge, Button, ConfirmDialog, EmptyState } from '@runly/ui'
import { ArrowDown, ArrowUp, ClipboardList, FileText, Layers, Link2, ListChecks, Pencil, Plus, Trash2, Video } from 'lucide-react'
import { useCreateSection, useDeleteLesson, useDeleteSection, useReorder, useUpdateSection } from '../hooks/useLmsData.js'
import { KIND_LABELS, formatDuration, moveLesson, moveSection, toReorderPayload } from '../lib/lmsLabels.js'
import { LessonSheet } from './LessonSheet.jsx'
import { QuizQuestionsSheet } from './QuizQuestionsSheet.jsx'
import { SectionDialog } from './SectionDialog.jsx'

const KIND_ICONS = { video: Video, embed: Link2, text: FileText, file: FileText, quiz: ListChecks, assignment: ClipboardList }

function IconButton({ label, onClick, disabled, children, destructive = false }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={destructive ? 'text-[hsl(var(--destructive))]' : undefined}>
      {children}
    </Button>
  )
}

function LessonRow({ lesson, first, last, onMove, onEdit, onDelete, onQuestions, busy }) {
  const Icon = KIND_ICONS[lesson.kind] ?? FileText
  const meta = [KIND_LABELS[lesson.kind], formatDuration(lesson.durationSeconds)].filter(Boolean).join(' · ')
  return (
    <li className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-[hsl(var(--muted)/0.6)]">
      <Icon className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
      <button type="button" onClick={onEdit} className="min-w-0 flex-1 cursor-pointer text-left">
        <span className="block truncate text-sm font-medium">{lesson.title}</span>
        <span className="block text-xs text-[hsl(var(--muted-foreground))]">{meta}</span>
      </button>
      {lesson.required === false ? <Badge variant="outline">Opcional</Badge> : null}
      <div className="flex shrink-0 items-center">
        <IconButton label="Subir" onClick={() => onMove(-1)} disabled={first || busy}><ArrowUp /></IconButton>
        <IconButton label="Bajar" onClick={() => onMove(1)} disabled={last || busy}><ArrowDown /></IconButton>
        {lesson.kind === 'quiz' ? <IconButton label="Editar preguntas" onClick={onQuestions} disabled={busy}><ListChecks /></IconButton> : null}
        <IconButton label="Editar lección" onClick={onEdit}><Pencil /></IconButton>
        <IconButton label="Eliminar lección" onClick={onDelete} destructive><Trash2 /></IconButton>
      </div>
    </li>
  )
}

// Contenido tab: sections and lessons with add / rename / delete / move.
export function CurriculumEditor({ courseId, sections, readOnly = false }) {
  const createSection = useCreateSection(), updateSection = useUpdateSection(), deleteSection = useDeleteSection()
  const deleteLesson = useDeleteLesson(), reorder = useReorder()
  const [sectionDialog, setSectionDialog] = useState({ open: false, section: null })
  const [lessonSheet, setLessonSheet] = useState({ open: false, lesson: null, sectionId: null })
  const [confirm, setConfirm] = useState(null) // { kind: 'section' | 'lesson', item }
  const [questionsFor, setQuestionsFor] = useState(null)
  const list = sections ?? []
  const flat = list.flatMap((section) => section.lessons ?? [])

  function applyOrder(next) {
    if (next) reorder.mutate({ courseId, ...toReorderPayload(next) })
  }

  async function saveSection(title) {
    try {
      if (sectionDialog.section) await updateSection.mutateAsync({ id: sectionDialog.section.id, title })
      else await createSection.mutateAsync({ courseId, title })
      setSectionDialog({ open: false, section: null })
    } catch { /* toast shown by the mutation */ }
  }

  async function confirmDelete() {
    try {
      if (confirm.kind === 'section') await deleteSection.mutateAsync(confirm.item.id)
      else await deleteLesson.mutateAsync(confirm.item.id)
      setConfirm(null)
    } catch { /* toast shown by the mutation */ }
  }

  const addSection = <Button onClick={() => setSectionDialog({ open: true, section: null })} disabled={readOnly}><Plus />Agregar sección</Button>
  if (!list.length) {
    return (
      <>
        <EmptyState icon={Layers} title="El curso aún no tiene contenido" description="Agrega una sección y dentro de ella las lecciones: videos, enlaces, textos, archivos, exámenes o tareas." action={addSection} />
        <SectionDialog open={sectionDialog.open} onOpenChange={(open) => setSectionDialog((s) => ({ ...s, open }))} section={null} onSubmit={saveSection} pending={createSection.isPending} />
      </>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{list.length} {list.length === 1 ? 'sección' : 'secciones'} · {flat.length} {flat.length === 1 ? 'lección' : 'lecciones'}</p>
        {addSection}
      </div>
      {list.map((section, sIndex) => (
        <section key={section.id} className="rounded-2xl surface-card p-3 sm:p-4">
          <header className="mb-2 flex flex-wrap items-center gap-2">
            <h3 className="min-w-0 flex-1 truncate text-base font-semibold">{sIndex + 1}. {section.title}</h3>
            <div className="flex items-center">
              <IconButton label="Subir sección" onClick={() => applyOrder(moveSection(list, section.id, -1))} disabled={sIndex === 0 || reorder.isPending || readOnly}><ArrowUp /></IconButton>
              <IconButton label="Bajar sección" onClick={() => applyOrder(moveSection(list, section.id, 1))} disabled={sIndex === list.length - 1 || reorder.isPending || readOnly}><ArrowDown /></IconButton>
              <IconButton label="Renombrar sección" onClick={() => setSectionDialog({ open: true, section })} disabled={readOnly}><Pencil /></IconButton>
              <IconButton label="Eliminar sección" onClick={() => setConfirm({ kind: 'section', item: section })} disabled={readOnly} destructive><Trash2 /></IconButton>
            </div>
          </header>
          {(section.lessons ?? []).length ? (
            <ul className="space-y-0.5">
              {section.lessons.map((lesson) => {
                const index = flat.findIndex((item) => item.id === lesson.id)
                return (
                  <LessonRow
                    key={lesson.id} lesson={lesson} first={index === 0} last={index === flat.length - 1} busy={reorder.isPending || readOnly}
                    onMove={(delta) => applyOrder(moveLesson(list, lesson.id, delta))}
                    onEdit={() => setLessonSheet({ open: true, lesson, sectionId: section.id })}
                    onDelete={() => setConfirm({ kind: 'lesson', item: lesson })}
                    onQuestions={() => setQuestionsFor(lesson)}
                  />
                )
              })}
            </ul>
          ) : <p className="px-2 py-2 text-sm text-[hsl(var(--muted-foreground))]">Sin lecciones todavía.</p>}
          <Button variant="outline" size="sm" className="mt-2" onClick={() => setLessonSheet({ open: true, lesson: null, sectionId: section.id })} disabled={readOnly}>
            <Plus />Agregar lección
          </Button>
        </section>
      ))}

      <SectionDialog
        open={sectionDialog.open} onOpenChange={(open) => setSectionDialog((s) => ({ ...s, open }))} section={sectionDialog.section}
        onSubmit={saveSection} pending={createSection.isPending || updateSection.isPending}
      />
      <LessonSheet
        open={lessonSheet.open} onOpenChange={(open) => setLessonSheet((s) => ({ ...s, open }))}
        lesson={lessonSheet.lesson} sectionId={lessonSheet.sectionId} sections={list}
        onEditQuestions={readOnly ? undefined : setQuestionsFor}
      />
      <QuizQuestionsSheet open={Boolean(questionsFor)} onOpenChange={(open) => { if (!open) setQuestionsFor(null) }} lesson={questionsFor} />
      <ConfirmDialog
        open={Boolean(confirm)} onOpenChange={(open) => { if (!open) setConfirm(null) }}
        icon={Trash2}
        title={confirm?.kind === 'section' ? 'Eliminar sección' : 'Eliminar lección'}
        description={confirm?.kind === 'section'
          ? `Se eliminará «${confirm?.item?.title}» junto con todas sus lecciones. Esta acción no se puede deshacer.`
          : `Se eliminará la lección «${confirm?.item?.title}». El avance de los alumnos en ella deja de contar.`}
        confirmLabel="Eliminar"
        loading={deleteSection.isPending || deleteLesson.isPending}
        onConfirm={confirmDelete}
      />
    </div>
  )
}
