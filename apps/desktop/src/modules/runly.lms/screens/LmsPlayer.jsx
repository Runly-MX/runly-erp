import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Button, EmptyState, ErrorState, PageHeader, ProgressBar, Skeleton } from '@runly/ui'
import { BookOpen, ListTree, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { CourseOutline } from '../components/CourseOutline.jsx'
import { CompletionBanner } from '../components/certificates/CompletionBanner.jsx'
import { LessonContent } from '../components/LessonContent.jsx'
import { FormSheet, useRouteId } from '../components/shared.jsx'
import { CourseRating } from '../components/social/CourseRating.jsx'
import { LessonTabs } from '../components/social/LessonTabs.jsx'
import { RateCoursePrompt } from '../components/social/RateCoursePrompt.jsx'
import { ReviewsDialog } from '../components/social/ReviewsDialog.jsx'
import { useLesson, useLmsPermissions, useOutline, useSaveProgress } from '../hooks/useLmsData.js'
import { useReviews } from '../hooks/useLmsSocial.js'
import { flattenLessons, lmsPath, normalizePlayerTab, pickStartLesson } from '../lib/lmsLabels.js'

function Centered({ children }) {
  return <div className="flex h-full min-h-[60dvh] items-center justify-center p-6">{children}</div>
}

function LessonPane({ lesson, outlineLessons, ...props }) {
  if (lesson.isLoading) return <div className="mx-auto w-full max-w-4xl space-y-4"><Skeleton className="h-8 w-2/3" /><Skeleton className="aspect-video w-full rounded-xl" /></div>
  if (lesson.isError) {
    const locked = lesson.error?.status === 409
    return locked
      ? <EmptyState icon={Lock} title="Lección bloqueada" description="Completa las lecciones obligatorias anteriores para abrir esta." />
      : <ErrorState title="No se pudo abrir la lección" description={lesson.error?.message} onRetry={() => lesson.refetch()} />
  }
  if (!lesson.data) return null
  const next = outlineLessons.find((item) => item.id === lesson.data.nextLessonId)
  return <LessonContent payload={lesson.data} canGoNext={Boolean(next) && next.status !== 'locked'} {...props} />
}

export default function LmsPlayer() {
  const navigate = useNavigate()
  const courseId = useRouteId()
  const outline = useOutline(courseId)
  const { canManageCourses } = useLmsPermissions()
  // The open lesson and tab live in the URL (?lesson=&tab=) so notification
  // links ("Respuesta en una pregunta", "Nuevo anuncio") land on the right place.
  const [searchParams, setSearchParams] = useSearchParams()
  const lessonId = searchParams.get('lesson')
  const tab = normalizePlayerTab(searchParams.get('tab'))
  const [outlineOpen, setOutlineOpen] = useState(false)
  const [reviewsOpen, setReviewsOpen] = useState(false)
  const [initialRating, setInitialRating] = useState(0)
  const lesson = useLesson(lessonId)
  const save = useSaveProgress(courseId)

  const data = outline.data
  const preview = Boolean(data) && !data.enrollment
  const reviews = useReviews(courseId, { enabled: Boolean(data) })
  const lessons = useMemo(() => flattenLessons(data?.sections), [data?.sections])
  const current = lessons.find((item) => item.id === lessonId)
  const status = data?.enrollment?.status
  const statusRef = useRef(status)

  const setParams = (patch) => setSearchParams((current) => {
    const next = new URLSearchParams(current)
    Object.entries(patch).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)))
    return next
  }, { replace: true })

  useEffect(() => {
    if (!data || lessonId) return
    const start = pickStartLesson(data.sections, data.enrollment?.lastLessonId)
    if (start) setParams({ lesson: start })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, lessonId])

  // "Curso completado" fires once, when the enrollment flips to completed.
  useEffect(() => {
    if (statusRef.current && statusRef.current !== 'completed' && status === 'completed') toast.success('Curso completado. ¡Bien hecho!')
    statusRef.current = status
  }, [status])

  const back = () => navigate(preview && canManageCourses ? lmsPath(`/courses/${courseId}`) : lmsPath('/'))
  const select = (id) => { if (id) { setParams({ lesson: id, tab: null }); setOutlineOpen(false) } }
  const setTab = (value) => setParams({ tab: value === 'contenido' ? null : value })
  const openReviews = (rating = 0) => { setInitialRating(rating); setReviewsOpen(true) }

  function report(progress) {
    if (!lessonId || preview) return
    save.mutate({ lessonId, ...progress })
  }

  async function complete() {
    try {
      await save.mutateAsync({ lessonId, completed: true })
      toast.success('Lección completada.')
    } catch (error) { toast.error(error.message || 'No se pudo guardar el avance.') }
  }

  if (outline.isLoading) {
    return <div className="flex h-full flex-col gap-4 p-4 sm:p-6"><Skeleton className="h-10 w-1/2" /><Skeleton className="min-h-0 flex-1 rounded-2xl" /></div>
  }
  if (outline.isError) {
    const notEnrolled = outline.error?.status === 403
    return (
      <Centered>
        <ErrorState
          title={notEnrolled ? 'No estás inscrito en este curso' : 'No se pudo abrir el curso'}
          description={notEnrolled ? 'Pide que te asignen el curso o inscríbete desde el catálogo.' : outline.error?.message}
          onRetry={notEnrolled ? undefined : () => outline.refetch()}
        />
      </Centered>
    )
  }
  if (!data) return null

  const pct = data.enrollment?.progressPct ?? 0
  const rating = reviews.data ?? data.course ?? {}
  const showRatePrompt = !preview && Boolean(reviews.data?.canReview) && !reviews.data?.mine
  const outlineNode = <CourseOutline sections={data.sections} currentLessonId={lessonId} onSelect={select} />
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[hsl(var(--background))]">
      <div className="shrink-0 border-b border-[hsl(var(--border))] px-4 pt-3 sm:px-6">
        <PageHeader
          compact
          onBack={back}
          backLabel={preview ? 'Volver al editor' : 'Mis cursos'}
          eyebrow={preview ? 'Vista previa' : 'Aprendizaje'}
          title={data.course?.title ?? 'Curso'}
          className="pb-3"
          actions={(
            <div className="flex items-center gap-3">
              <CourseRating avg={rating.ratingAvg} count={rating.ratingCount} showEmpty onClick={() => openReviews()} />
              {preview ? <Badge variant="warning">Vista previa: el avance no se guarda</Badge> : (
                <div className="hidden w-40 items-center gap-2 sm:flex">
                  <ProgressBar value={pct} />
                  <span className="text-xs font-medium tabular-nums">{pct}%</span>
                </div>
              )}
              <Button variant="outline" size="sm" className="lg:hidden" onClick={() => setOutlineOpen(true)}><ListTree />Contenido</Button>
            </div>
          )}
        />
      </div>
      <div className="flex min-h-0 flex-1">
        <aside className="hidden w-80 shrink-0 overflow-y-auto border-r border-[hsl(var(--border))] p-3 lg:block">{outlineNode}</aside>
        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 sm:px-8 sm:py-8">
          {!lessons.length ? (
            <EmptyState icon={BookOpen} title="Este curso aún no tiene lecciones" description="Cuando se agregue contenido aparecerá aquí." />
          ) : !lessonId ? (
            <EmptyState icon={Lock} title="No hay lecciones disponibles" description="Todas las lecciones están bloqueadas por ahora." />
          ) : (
            <>
              {!preview && status === 'completed' ? <CompletionBanner courseId={courseId} /> : null}
              {showRatePrompt ? <RateCoursePrompt key={courseId} courseId={courseId} completed={status === 'completed'} onRate={openReviews} /> : null}
              <LessonTabs
                courseId={courseId} lessonId={lessonId} tab={tab} onTabChange={setTab}
                announcementCount={data.announcementCount} readOnly={status === 'dropped'}
              >
                <LessonPane
                  lesson={lesson} outlineLessons={lessons} courseId={courseId} status={current?.status} preview={preview}
                  onProgress={report} onComplete={complete} completing={save.isPending} onNavigate={select}
                />
              </LessonTabs>
            </>
          )}
        </main>
      </div>
      <FormSheet open={outlineOpen} onOpenChange={setOutlineOpen} title="Contenido del curso" description={preview ? 'Vista previa' : `Avance: ${pct}%`}>
        {outlineNode}
      </FormSheet>
      <ReviewsDialog open={reviewsOpen} onOpenChange={setReviewsOpen} courseId={courseId} courseTitle={data.course?.title} initialRating={initialRating} />
    </div>
  )
}
