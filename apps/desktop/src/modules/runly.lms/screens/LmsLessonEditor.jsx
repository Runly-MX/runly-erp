import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Button, ConfirmDialog, EmptyState, ErrorState, PageHeader, Skeleton } from '@runly/ui'
import { FileQuestion, Layers, ListTree, Loader2, Undo2 } from 'lucide-react'
import { CourseCurriculumNav } from '../components/curriculum/CourseCurriculumNav.jsx'
import { LessonEditorForm } from '../components/lesson-editor/LessonEditorForm.jsx'
import { FormSheet, useRouteSegment } from '../components/shared.jsx'
import { useCourse, useSaveLesson } from '../hooks/useLmsData.js'
import { isLessonFormDirty, lessonFormToPayload, lessonToForm, validateLessonForm } from '../lib/lessonForm.js'
import { KIND_LABELS, lessonEditorPath, lmsPath } from '../lib/lmsLabels.js'

function Centered({ children }) {
  return <div className="flex h-full min-h-[60dvh] items-center justify-center p-6">{children}</div>
}

function Loading() {
  return (
    <div className="flex h-full flex-col gap-4 p-4 sm:p-6">
      <Skeleton className="h-10 w-1/2" />
      <div className="flex min-h-0 flex-1 gap-4"><Skeleton className="hidden w-80 rounded-2xl lg:block" /><Skeleton className="flex-1 rounded-2xl" /></div>
    </div>
  )
}

// Full-screen lesson editor: /courses/:courseId/lessons/:lessonId ('new' with
// ?section= creates). Sticky header, drag-and-drop curriculum on the left and
// the lesson editor on the right. Leaving with unsaved changes asks first.
export default function LmsLessonEditor() {
  const navigate = useNavigate()
  const courseId = useRouteSegment(1), routeLessonId = useRouteSegment(3)
  const [searchParams] = useSearchParams()
  const isNew = routeLessonId === 'new'
  const query = useCourse(courseId)
  const save = useSaveLesson()
  const [state, setState] = useState(null) // { key, form, baseline }
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [questionsDirty, setQuestionsDirty] = useState(false)
  const [pendingNav, setPendingNav] = useState(null)
  const [navOpen, setNavOpen] = useState(false)

  const sections = query.data?.sections ?? []
  const course = query.data?.course
  const lesson = isNew ? null : sections.flatMap((section) => section.lessons ?? []).find((item) => item.id === routeLessonId) ?? null
  const readOnly = course?.status === 'archived'
  const requestedSection = searchParams.get('section')
  const ready = Boolean(query.data) && (isNew || Boolean(lesson))

  // Seed the form once per route lesson; refetches (reorder, saves) never
  // overwrite edits in progress.
  useEffect(() => {
    if (!ready || state?.key === routeLessonId) return
    const sectionId = isNew ? (sections.some((s) => s.id === requestedSection) ? requestedSection : sections[0]?.id ?? null) : null
    const form = lessonToForm(lesson, sectionId)
    setState({ key: routeLessonId, form, baseline: form })
    setErrors({})
    setQuestionsDirty(false)
  }, [ready, routeLessonId]) // eslint-disable-line react-hooks/exhaustive-deps

  const form = state?.key === routeLessonId ? state.form : null
  const lessonId = isNew ? null : routeLessonId
  const formDirty = Boolean(form) && !readOnly && isLessonFormDirty(form, state.baseline, { id: lessonId })
  const dirty = formDirty || (!readOnly && questionsDirty)

  useEffect(() => {
    if (!dirty) return undefined
    const warn = (event) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const setForm = (updater) => setState((current) => ({ ...current, form: typeof updater === 'function' ? updater(current.form) : updater }))
  const guard = (action) => { setNavOpen(false); if (dirty) setPendingNav(() => action); else action() }
  const back = () => guard(() => navigate(lmsPath(`/courses/${courseId}`)))
  const selectLesson = (id) => { if (id !== routeLessonId) guard(() => navigate(lessonEditorPath(courseId, id))) }
  const addLesson = (sectionId) => guard(() => navigate(lessonEditorPath(courseId, 'new', sectionId)))

  async function submit() {
    const next = validateLessonForm(form)
    setErrors(next)
    if (Object.keys(next).length) return
    try {
      const saved = await save.mutateAsync(lessonFormToPayload(form, { id: lessonId }))
      if (isNew && saved?.id) {
        // Keep the typed values while the course refetch brings the new lesson.
        setState((current) => ({ key: saved.id, form: current.form, baseline: current.form }))
        navigate(lessonEditorPath(courseId, saved.id), { replace: true })
      } else setState((current) => ({ ...current, baseline: current.form }))
    } catch { /* toast shown by the mutation */ }
  }

  if (query.isLoading) return <Loading />
  if (query.isError || !query.data) {
    return (
      <Centered>
        <ErrorState title={query.error?.status === 404 ? 'El curso no existe' : 'No se pudo cargar el curso'} description={query.error?.message} onRetry={() => query.refetch()} />
      </Centered>
    )
  }
  if (!isNew && !lesson && !form) {
    if (query.isFetching) return <Loading />
    return (
      <Centered>
        <EmptyState icon={FileQuestion} title="La lección no existe" description="Puede que la hayan eliminado." action={<Button variant="outline" onClick={() => navigate(lmsPath(`/courses/${courseId}`))}>Volver al curso</Button>} />
      </Centered>
    )
  }
  if (isNew && !sections.length) {
    return (
      <Centered>
        <EmptyState icon={Layers} title="El curso no tiene secciones" description="Agrega una sección antes de crear lecciones." action={<Button variant="outline" onClick={() => navigate(lmsPath(`/courses/${courseId}`))}>Volver al curso</Button>} />
      </Centered>
    )
  }
  if (!form) return <Loading />

  const status = readOnly ? 'Solo lectura: el curso está archivado' : busy ? 'Subiendo archivo…' : dirty ? 'Cambios sin guardar' : isNew ? 'Lección nueva' : 'Todo guardado'
  const nav = (
    <CourseCurriculumNav
      courseId={courseId} sections={sections} currentLessonId={lessonId} readOnly={readOnly}
      onSelect={selectLesson} onAdd={addLesson}
    />
  )
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[hsl(var(--background))]">
      <div className="sticky top-0 z-10 shrink-0 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 pt-3 sm:px-6">
        <PageHeader
          compact onBack={back} backLabel="Curso" eyebrow={course?.title ?? 'Curso'}
          title={form.title.trim() || (isNew ? 'Nueva lección' : lesson?.title ?? 'Lección')}
          description={(
            <span className="inline-flex flex-wrap items-center gap-2">
              <Badge variant="outline">{KIND_LABELS[form.kind] ?? form.kind}</Badge>
              <span aria-live="polite">{status}</span>
            </span>
          )}
          className="pb-3"
          actions={(
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setNavOpen(true)}><ListTree />Contenido</Button>
              {formDirty && !isNew ? (
                <Button variant="outline" onClick={() => { setState((current) => ({ ...current, form: current.baseline })); setErrors({}) }}><Undo2 />Descartar</Button>
              ) : null}
              {!readOnly ? (
                <Button onClick={submit} disabled={save.isPending || busy || (!formDirty && !isNew)}>
                  {save.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
                  {isNew ? 'Crear lección' : 'Guardar'}
                </Button>
              ) : null}
            </div>
          )}
        />
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-80 shrink-0 overflow-y-auto border-r border-[hsl(var(--border))] p-3 lg:block">{nav}</aside>
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-6">
          <div className="mx-auto w-full max-w-5xl">
            <LessonEditorForm
              form={form} setForm={setForm} errors={errors} lesson={lesson} sections={sections} isNew={isNew} readOnly={readOnly}
              onBusyChange={setBusy} onQuestionsDirtyChange={setQuestionsDirty}
            />
          </div>
        </main>
      </div>
      <FormSheet open={navOpen} onOpenChange={setNavOpen} title="Contenido del curso" description="Elige una lección o arrastra para cambiar el orden.">
        {nav}
      </FormSheet>
      <ConfirmDialog
        open={Boolean(pendingNav)} onOpenChange={(open) => { if (!open) setPendingNav(null) }}
        icon={Undo2} title="Descartar cambios"
        description="Esta lección tiene cambios sin guardar. Si sales ahora, se perderán."
        confirmLabel="Descartar y salir"
        onConfirm={() => { const action = pendingNav; setPendingNav(null); action?.() }}
      />
    </div>
  )
}
