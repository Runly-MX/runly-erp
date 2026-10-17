import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Badge, Button, EmptyState, ErrorState, PageHeader, ProgressBar, Skeleton, cn } from '@runly/ui'
import { BookOpen, ListTree, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { CourseOutline } from '../components/CourseOutline.jsx'
import { CompletionBanner } from '../components/certificates/CompletionBanner.jsx'
import { LessonBody, LessonHeader, LessonStage, hasStage } from '../components/LessonContent.jsx'
import { useRouteId } from '../components/shared.jsx'
import { CourseRating } from '../components/social/CourseRating.jsx'
import { LessonTabs } from '../components/social/LessonTabs.jsx'
import { RateCoursePrompt } from '../components/social/RateCoursePrompt.jsx'
import { ReviewsDialog } from '../components/social/ReviewsDialog.jsx'
import { useLesson, useLmsPermissions, useOutline, useSaveProgress } from '../hooks/useLmsData.js'
import { useReviews } from '../hooks/useLmsSocial.js'
import { coursePagePath, readTheater, writeTheater } from '../lib/lmsExperience.js'
import { flattenLessons, lmsPath, normalizePlayerTab, pickStartLesson } from '../lib/lmsLabels.js'

function Centered({ children }) {
  return <div className="flex h-full min-h-[60dvh] items-center justify-center p-6">{children}</div>
}

function LessonError({ lesson }) {
  return lesson.error?.status === 409
    ? <EmptyState icon={Lock} title="Lección bloqueada" description="Completa las lecciones obligatorias anteriores para abrir esta." />
    : <ErrorState title="No se pudo abrir la lección" description={lesson.error?.message} onRetry={() => lesson.refetch()} />
}

// Learner player (racoon-lms LearnPage layout): stage, lesson header and tabs on
// the left, the content sidebar on the right (below on mobile). Theater mode
// widens the video to both columns and drops the sidebar under it; it is
// remembered per viewer. One grid with fixed DOM order keeps the video mounted
// when theater mode toggles.
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
  const [reviewsOpen, setReviewsOpen] = useState(false)
  const [initialRating, setInitialRating] = useState(0)
  const [theater, setTheater] = useState(() => readTheater())
  const sidebarRef = useRef(null)
  const lesson = useLesson(lessonId)
  const save = useSaveProgress(courseId)

  const data = outline.data
  const preview = Boolean(data) && !data.enrollment
  const reviews = useReviews(courseId, { enabled: Boolean(data) })
  const lessons = useMemo(() => flattenLessons(data?.sections), [data?.sections])
  const current = lessons.find((item) => item.id === lessonId)
  const status = data?.enrollment?.status
  const statusRef = useRef(status)

  const setParams = (patch) => setSearchParams((currentParams) => {
    const next = new URLSearchParams(currentParams)
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

  const back = () => navigate(preview && canManageCourses ? lmsPath(`/courses/${courseId}`) : coursePagePath(courseId))
  const select = (id) => {
    if (!id) return
    setParams({ lesson: id, tab: null })
    sidebarRef.current?.closest('[data-player-scroll]')?.scrollTo?.({ top: 0 })
  }
  const setTab = (value) => setParams({ tab: value === 'descripcion' ? null : value })
  const openReviews = (rating = 0) => { setInitialRating(rating); setReviewsOpen(true) }
  const changeTheater = (value) => { setTheater(value); writeTheater(value) }
  const showContents = () => sidebarRef.current?.scrollIntoView({ behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' })

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
    return (
      <div className="grid h-full gap-6 p-4 sm:p-6 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4"><Skeleton className="h-10 w-1/2" /><Skeleton className="aspect-video w-full rounded-md" /></div>
        <Skeleton className="hidden h-96 rounded-md lg:block" />
      </div>
    )
  }
  if (outline.isError) {
    if (outline.error?.status === 403) {
      return (
        <Centered>
          <EmptyState
            icon={Lock} title="No estás inscrito en este curso"
            description="Pide que te asignen el curso o inscríbete desde su página."
            action={<Button variant="outline" onClick={() => navigate(coursePagePath(courseId))}>Ver el curso</Button>}
          />
        </Centered>
      )
    }
    return <Centered><ErrorState title="No se pudo abrir el curso" description={outline.error?.message} onRetry={() => outline.refetch()} /></Centered>
  }
  if (!data) return null

  const pct = data.enrollment?.progressPct ?? 0
  const rating = reviews.data ?? data.course ?? {}
  const showRatePrompt = !preview && Boolean(reviews.data?.canReview) && !reviews.data?.mine
  const payload = lesson.data
  const stage = Boolean(payload) && hasStage(payload.lesson)
  const stageArea = stage || lesson.isLoading
  const theaterOn = theater && stage && payload.lesson.kind === 'video'
  const next = payload ? lessons.find((item) => item.id === payload.nextLessonId) : null

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden bg-[hsl(var(--background))]">
      <div className="shrink-0 border-b border-[hsl(var(--border))] px-4 pt-3 sm:px-6">
        <PageHeader
          compact
          onBack={back}
          backLabel={preview && canManageCourses ? 'Volver al editor' : 'Curso'}
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
              <Button variant="outline" size="sm" className="lg:hidden" onClick={showContents}><ListTree />Contenido</Button>
            </div>
          )}
        />
      </div>
      <div data-player-scroll="" className="min-h-0 flex-1 overflow-y-auto">
        {!lessons.length ? (
          <Centered><EmptyState icon={BookOpen} title="Este curso aún no tiene lecciones" description="Cuando se agregue contenido aparecerá aquí." /></Centered>
        ) : (
          <div className="mx-auto grid w-full max-w-[1600px] gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8 lg:py-6">
            {stageArea ? (
              <div className={cn('min-w-0', theaterOn ? 'lg:col-span-2' : 'lg:col-start-1 lg:row-start-1')}>
                <div className={cn('mx-auto w-full transition-[max-width] duration-300 ease-out motion-reduce:transition-none', theaterOn ? 'max-w-[min(100%,calc((100dvh-13rem)*16/9))]' : 'max-w-full')}>
                  {payload ? (
                    <LessonStage payload={payload} preview={preview} onProgress={report} theater={theaterOn} onTheaterChange={changeTheater} />
                  ) : <Skeleton className="aspect-video w-full rounded-md" />}
                </div>
              </div>
            ) : null}

            <div className={cn('min-w-0 space-y-5 lg:col-start-1', stageArea ? 'lg:row-start-2' : 'lg:row-start-1')}>
              {!lessonId ? (
                <EmptyState icon={Lock} title="No hay lecciones disponibles" description="Todas las lecciones están bloqueadas por ahora." />
              ) : lesson.isLoading ? (
                <div className="space-y-3"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24 w-full" /></div>
              ) : lesson.isError ? <LessonError lesson={lesson} /> : payload ? (
                <>
                  {!preview && status === 'completed' ? <CompletionBanner courseId={courseId} /> : null}
                  {showRatePrompt ? <RateCoursePrompt key={courseId} courseId={courseId} completed={status === 'completed'} onRate={openReviews} /> : null}
                  <LessonHeader
                    payload={payload} status={current?.status} preview={preview}
                    onComplete={complete} completing={save.isPending} onNavigate={select}
                    canGoNext={Boolean(next) && next.status !== 'locked'}
                  />
                  <LessonTabs
                    courseId={courseId} lessonId={lessonId} tab={tab} onTabChange={setTab}
                    resources={payload.lesson.resources} announcementCount={data.announcementCount} readOnly={status === 'dropped'}
                  >
                    <LessonBody payload={payload} courseId={courseId} status={current?.status} preview={preview} />
                  </LessonTabs>
                </>
              ) : null}
            </div>

            <aside
              ref={sidebarRef}
              className={cn(
                'min-w-0 scroll-mt-4 lg:sticky lg:top-6 lg:col-start-2 lg:max-h-[calc(100dvh-10rem)] lg:self-start lg:overflow-y-auto lg:pr-1',
                theaterOn ? 'lg:row-start-2' : stageArea ? 'lg:row-start-1 lg:row-span-2' : 'lg:row-start-1',
              )}
            >
              <CourseOutline sections={data.sections} currentLessonId={lessonId} onSelect={select} progressPct={preview ? null : pct} />
            </aside>
          </div>
        )}
      </div>
      <ReviewsDialog open={reviewsOpen} onOpenChange={setReviewsOpen} courseId={courseId} courseTitle={data.course?.title} initialRating={initialRating} />
    </div>
  )
}
