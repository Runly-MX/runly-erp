import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, ConfirmDialog, EmptyState, cn } from '@runly/ui'
import { Gift, Layers, MoveDown, Pencil, Plus, Trash2 } from 'lucide-react'
import { useCreateSection, useDeleteLesson, useDeleteSection, useReorder, useUpdateSection } from '../hooks/useLmsData.js'
import { KIND_LABELS, formatDuration, lessonEditorPath } from '../lib/lmsLabels.js'
import { kindTone, lessonCountLabel, sectionSeconds } from '../lib/lmsExperience.js'
import { DragHandle } from './curriculum/DragHandle.jsx'
import { SortableCurriculum } from './curriculum/SortableCurriculum.jsx'
import { SectionDialog } from './SectionDialog.jsx'
import { LessonThumb } from './LessonThumb.jsx'

function IconButton({ label, onClick, disabled, children, destructive = false }) {
  return (
    <Button type="button" variant="ghost" size="icon-sm" aria-label={label} title={label} onClick={onClick} disabled={disabled} className={destructive ? 'text-[hsl(var(--destructive))]' : undefined}>
      {children}
    </Button>
  )
}

function LessonRow({ lesson, handleProps, overlay, onOpen, onDelete, readOnly, free = false }) {
  const duration = formatDuration(lesson.durationSeconds)
  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] py-1.5 pl-1 pr-1.5 transition-colors hover:border-violet-500/50 motion-reduce:transition-none',
        overlay && 'shadow-lg',
      )}
    >
      <DragHandle handleProps={handleProps} overlay={overlay} label={`Mover la lección «${lesson.title}»`} />
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 cursor-pointer items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:bg-[hsl(var(--muted))]">
        <LessonThumb lesson={lesson} showDuration={false} className={cn('w-20', !handleProps && !overlay && 'ml-1')} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium">{lesson.title}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[hsl(var(--muted-foreground))]">
            <span className={cn('inline-flex items-center rounded-md bg-linear-to-br px-1.5 py-px font-medium', kindTone(lesson.kind))}>{KIND_LABELS[lesson.kind] ?? lesson.kind}</span>
            {duration ? <span className="tabular-nums">{duration}</span> : null}
          </span>
        </span>
      </button>
      {free ? <Badge variant="success" className="hidden sm:inline-flex" title="Se abre sin inscripción desde la página del curso">Gratis</Badge> : null}
      {lesson.required === false
        ? <Badge variant="outline" className="hidden sm:inline-flex">Opcional</Badge>
        : <Badge variant="secondary" className="hidden sm:inline-flex">Obligatoria</Badge>}
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
  // Lessons that open without enrolling: free section or preview (never quizzes/assignments).
  const freeSectionLessons = new Set(list.filter((section) => section.free).flatMap((section) => (section.lessons ?? []).map((lesson) => lesson.id)))
  const isFree = (lesson) => lesson.kind !== 'quiz' && lesson.kind !== 'assignment' && (lesson.preview === true || freeSectionLessons.has(lesson.id))
  const toggleFree = (section) => updateSection.mutate({ id: section.id, free: !section.free })
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
        sections={list} disabled={readOnly} className="space-y-4" listClassName="space-y-2"
        onReorder={(next) => reorder.mutate({ courseId, sections: next })}
        renderSection={({ section, index, handleProps, overlay, lessons }) => {
          const count = section.lessons?.length ?? 0
          const duration = formatDuration(sectionSeconds(section))
          return (
            <section className={cn('overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]', overlay && 'shadow-lg')}>
              <header className="flex items-center gap-2 bg-[hsl(var(--muted)/0.5)] px-2 py-2 sm:px-3">
                <DragHandle handleProps={handleProps} overlay={overlay} label={`Mover la sección «${section.title}»`} />
                <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-violet-600/10 text-xs font-semibold tabular-nums text-violet-700 dark:text-violet-300', !handleProps && !overlay && 'ml-1')}>
                  {index + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="flex min-w-0 items-center gap-2 text-sm font-semibold sm:text-base">
                    <span className="truncate">{section.title}</span>
                    {section.free ? <Badge variant="success" className="shrink-0">Gratis</Badge> : null}
                  </h3>
                  <p className="text-xs text-[hsl(var(--muted-foreground))]">{lessonCountLabel(count)}{duration ? ` · ${duration}` : ''}</p>
                </div>
                {!overlay && !readOnly ? (
                  <div className="flex items-center">
                    <IconButton label={section.free ? 'Quitar sección gratis' : 'Marcar sección como gratis'} onClick={() => toggleFree(section)} disabled={updateSection.isPending}><Gift /></IconButton>
                    <IconButton label="Renombrar sección" onClick={() => setSectionDialog({ open: true, section })}><Pencil /></IconButton>
                    <IconButton label="Eliminar sección" onClick={() => setConfirm({ kind: 'section', item: section })} destructive><Trash2 /></IconButton>
                  </div>
                ) : null}
              </header>
              {lessons ? (
                <div className="space-y-2 p-2 sm:p-3">
                  {lessons}
                  {!readOnly ? (
                    <Button
                      variant="outline" size="sm"
                      className="w-full rounded-md border-dashed text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]"
                      onClick={() => navigate(lessonEditorPath(courseId, 'new', section.id))}
                    >
                      <Plus />Agregar lección
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </section>
          )
        }}
        renderLesson={({ lesson, handleProps, overlay }) => (
          <LessonRow
            lesson={lesson} handleProps={handleProps} overlay={overlay} readOnly={readOnly} free={isFree(lesson)}
            onOpen={() => openLesson(lesson)} onDelete={() => setConfirm({ kind: 'lesson', item: lesson })}
          />
        )}
        renderEmpty={() => (
          <div className="flex flex-col items-center gap-1 px-3 py-6 text-center text-sm text-[hsl(var(--muted-foreground))]">
            <MoveDown className="h-5 w-5" aria-hidden="true" />
            <p className="font-medium">Sin lecciones todavía</p>
            {readOnly ? null : <p className="text-xs">Arrastra una lección aquí o agrega una nueva.</p>}
          </div>
        )}
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
