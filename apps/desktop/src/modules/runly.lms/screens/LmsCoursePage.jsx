import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, AlertDescription, Button, EmptyState, ErrorState, Skeleton } from '@runly/ui'
import { FileQuestion } from 'lucide-react'
import { CourseDescription, CourseReviews, InstructorCard } from '../components/course-page/CourseAbout.jsx'
import { CourseCtaBar, CourseCtaCard } from '../components/course-page/CourseCta.jsx'
import { CourseCurriculum } from '../components/course-page/CourseCurriculum.jsx'
import { CourseHero } from '../components/course-page/CourseHero.jsx'
import { useRouteId } from '../components/shared.jsx'
import { ReviewsDialog } from '../components/social/ReviewsDialog.jsx'
import { useEnroll, useLmsPermissions } from '../hooks/useLmsData.js'
import { useDownloadCertificate } from '../hooks/useLmsCerts.js'
import { useCourseOverview } from '../hooks/useLmsExperience.js'
import { courseCta, playerPath } from '../lib/lmsExperience.js'
import { lmsPath } from '../lib/lmsLabels.js'

function Block({ title, children }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  )
}

function Loading() {
  return (
    <div className="h-full overflow-y-auto">
      <Skeleton className="h-64 w-full rounded-none" />
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
        <div className="space-y-4"><Skeleton className="h-6 w-40" /><Skeleton className="h-32 w-full" /><Skeleton className="h-48 w-full" /></div>
        <Skeleton className="hidden h-96 rounded-2xl lg:block" />
      </div>
    </div>
  )
}

// Course page (racoon-lms CourseDetailView): blurred cover hero, sticky call to
// action (Inscribirme / Continuar / Ver certificado) with a fixed bar on phones,
// Markdown description, accordion curriculum, instructor and reviews.
export default function LmsCoursePage() {
  const navigate = useNavigate()
  const courseId = useRouteId()
  const query = useCourseOverview(courseId)
  const enroll = useEnroll()
  const download = useDownloadCertificate({ own: true })
  const { canManageCourses } = useLmsPermissions()
  const [reviewsOpen, setReviewsOpen] = useState(false)

  if (query.isLoading) return <Loading />
  if (query.isError || !query.data) {
    const missing = query.error?.status === 404
    return (
      <div className="flex h-full min-h-[60dvh] items-center justify-center p-6">
        {missing ? (
          <EmptyState icon={FileQuestion} title="El curso no existe" description="Puede que lo hayan archivado o que aún no se publique." action={<Button variant="outline" onClick={() => navigate(lmsPath('/'))}>Volver a mis cursos</Button>} />
        ) : <ErrorState title="No se pudo cargar el curso" description={query.error?.message} onRetry={() => query.refetch()} />}
      </div>
    )
  }

  const data = query.data
  const cta = courseCta(data)
  const enrolled = Boolean(data.enrollment && data.enrollment.status !== 'dropped')
  const canOpenLessons = enrolled || data.canManage
  const back = () => navigate(window.history.length > 1 ? -1 : lmsPath('/'))

  async function onAction(action) {
    if (action === 'enroll') {
      try {
        await enroll.mutateAsync(courseId)
        navigate(playerPath(courseId))
      } catch { /* toast shown by the mutation */ }
      return
    }
    if (action === 'certificate' && data.certificate) { download.mutate({ id: data.certificate.id, folio: data.certificate.folio, courseTitle: data.course.title }); return }
    if (action === 'edit') { navigate(lmsPath(`/courses/${courseId}`)); return }
    if (action !== 'none') navigate(playerPath(courseId))
  }

  const pending = enroll.isPending || download.isPending
  return (
    <div className="h-full overflow-y-auto bg-[hsl(var(--background))] pb-28 lg:pb-12">
      <CourseHero data={data} onBack={back} backLabel="Volver" onRatingClick={() => setReviewsOpen(true)} />
      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:px-8">
        <div className="min-w-0 space-y-10">
          {data.course.status !== 'published' && data.canManage ? (
            <Alert><AlertDescription>Vista de responsable: este curso está {data.course.status === 'draft' ? 'en borrador' : 'archivado'} y los alumnos no lo ven en el catálogo.</AlertDescription></Alert>
          ) : null}
          <Block title="Descripción"><CourseDescription markdown={data.course.description} /></Block>
          <Block title="Contenido del curso">
            <CourseCurriculum sections={data.sections} onOpenLesson={canOpenLessons ? (lessonId) => navigate(playerPath(courseId, lessonId)) : null} />
          </Block>
          {data.instructor ? <Block title="Instructor"><InstructorCard instructor={data.instructor} /></Block> : null}
          <Block title="Reseñas"><CourseReviews courseId={courseId} onOpenAll={() => setReviewsOpen(true)} /></Block>
        </div>
        <aside className="hidden lg:block">
          <div className="sticky top-6 lg:-mt-40">
            <CourseCtaCard data={data} cta={cta} onAction={onAction} pending={pending} />
            {canManageCourses && cta.action !== 'preview' ? (
              <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={() => navigate(lmsPath(`/courses/${courseId}`))}>Editar curso</Button>
            ) : null}
          </div>
        </aside>
      </div>
      <CourseCtaBar data={data} cta={cta} onAction={onAction} pending={pending} />
      <ReviewsDialog open={reviewsOpen} onOpenChange={setReviewsOpen} courseId={courseId} courseTitle={data.course.title} />
    </div>
  )
}
