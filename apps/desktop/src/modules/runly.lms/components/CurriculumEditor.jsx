import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, ConfirmDialog, EmptyState, cn } from '@runly/ui'
import { Layers, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCreateSection, useDeleteLesson, useDeleteSection, useReorder, useUpdateSection } from '../hooks/useLmsData.js'
import { lessonEditorPath } from '../lib/lmsLabels.js'
import { DragHandle } from './curriculum/DragHandle.jsx'
import { lessonIcon, lessonMeta } from './curriculum/lessonKind.js'
import { SortableCurriculum } from './curriculum/SortableCurriculum.jsx'
import { SectionDialog } from './SectionDialog.jsx'

function IconButton({ label, onClick, disabled, children, destructive = false }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={destructive ? 'text-[hsl(var(--destructive))]' : undefined}>
      {children}
    </Button>
  )
}

function LessonRow({ lesson, handleProps, overlay, onOpen, onDelete, readOnly }) {
  const Icon = lessonIcon(lesson.kind)
  return (
    <div className={cn('flex items-center gap-2 rounded-md px-1 py-1.5 hover:bg-[hsl(var(--muted)/0.6)]', overlay && 'bg-[hsl(var(--card))] shadow-lg')}>
      <DragHandle handleProps={handleProps} overlay={overlay} label={`Mover la lección «${lesson.title}»`} />
      <Icon className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
      <button type="button" onClick={onOpen} className="min-w-0 flex-1 cursor-pointer rounded-md text-left focus-visible:outline-none focus-visible:bg-[hsl(var(--muted))]">
        <span className="block truncate text-sm font-medium">{lesson.title}</span>
        <span className="block text-xs text-[hsl(var(--muted-foreground))]">{lessonMeta(lesson)}</span>
      </button>
      {lesson.required === false ? <Badge variant="outline">Opcional</Badge> : null}
      {!overlay ? (
        <div className="flex shrink-0 items-center">
          <IconButton label="Editar lección" onClick={onOpen}><Pencil /></IconButton>
          {!readOnly ? <IconButton label="Eliminar lección" onClick={onDelete} destructive><Trash2 /></IconButton> : null}
        </div>
      ) : null}
    </div>
  )
}

// Contenido tab: sections and lessons with drag and drop. Lessons open in the
// lesson editor page; sections keep their small rename/create dialog.
export function CurriculumEditor({ courseId, sections, readOnly = false }) {
  const navigate = useNavigate()
  const createSection = useCreateSection(), updateSection = useUpdateSection(), deleteSection = useDeleteSection()
  const deleteLesson = useDeleteLesson(), reorder = useReorder()
  const [sectionDialog, setSectionDialog] = useState({ open: false, section: null })
  const [confirm, setConfirm] = useState(null) // { kind: 'section' | 'lesson', item }
  const list = sections ?? []
  const lessonCount = list.reduce((sum, section) => sum + (section.lessons?.length ?? 0), 0)

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

  const sectionDialogNode = (
    <SectionDialog
      open={sectionDialog.open} onOpenChange={(open) => setSectionDialog((s) => ({ ...s, open }))} section={sectionDialog.section}
      onSubmit={saveSection} pending={createSection.isPending || updateSection.isPending}
    />
  )
  const addSection = <Button onClick={() => setSectionDialog({ open: true, section: null })} disabled={readOnly}><Plus />Agregar sección</Button>
  if (!list.length) {
    return (
      <>
        <EmptyState icon={Layers} title="El curso aún no tiene contenido" description="Agrega una sección y dentro de ella las lecciones: videos, enlaces, textos, archivos, exámenes o tareas." action={addSection} />
        {sectionDialogNode}
      </>
    )
  }

  const openLesson = (lesson) => navigate(lessonEditorPath(courseId, lesson.id))
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm text-[hsl(var(--muted-foreground))]">
          {list.length} {list.length === 1 ? 'sección' : 'secciones'} · {lessonCount} {lessonCount === 1 ? 'lección' : 'lecciones'}
          {readOnly ? '' : ' · Arrastra para cambiar el orden'}
        </p>
        {addSection}
      </div>
      <SortableCurriculum
        sections={list} disabled={readOnly} className="space-y-4"
        onReorder={(next) => reorder.mutate({ courseId, sections: next })}
        renderSection={({ section, index, handleProps, overlay, lessons }) => (
          <section className={cn('rounded-2xl surface-card p-3 sm:p-4', overlay && 'shadow-lg')}>
            <header className={cn('flex flex-wrap items-center gap-1', lessons && 'mb-2')}>
              <DragHandle handleProps={handleProps} overlay={overlay} label={`Mover la sección «${section.title}»`} />
              <h3 className="min-w-0 flex-1 truncate text-base font-semibold">{index + 1}. {section.title}</h3>
              {!overlay && !readOnly ? (
                <div className="flex items-center">
                  <IconButton label="Renombrar sección" onClick={() => setSectionDialog({ open: true, section })}><Pencil /></IconButton>
                  <IconButton label="Eliminar sección" onClick={() => setConfirm({ kind: 'section', item: section })} destructive><Trash2 /></IconButton>
                </div>
              ) : null}
            </header>
            {lessons}
            {lessons && !readOnly ? (
              <Button variant="outline" size="sm" className="mt-2" onClick={() => navigate(lessonEditorPath(courseId, 'new', section.id))}>
                <Plus />Agregar lección
              </Button>
            ) : null}
          </section>
        )}
        renderLesson={({ lesson, handleProps, overlay }) => (
          <LessonRow
            lesson={lesson} handleProps={handleProps} overlay={overlay} readOnly={readOnly}
            onOpen={() => openLesson(lesson)} onDelete={() => setConfirm({ kind: 'lesson', item: lesson })}
          />
        )}
        renderEmpty={() => <p className="px-3 py-3 text-sm text-[hsl(var(--muted-foreground))]">Sin lecciones todavía.{readOnly ? '' : ' Agrega una o arrastra una lección aquí.'}</p>}
      />

      {sectionDialogNode}
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
