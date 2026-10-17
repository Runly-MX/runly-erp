import { useNavigate } from 'react-router-dom'
import { Button, EmptyState, ErrorState, PageHeader, Skeleton } from '@runly/ui'
import { GraduationCap, Settings2 } from 'lucide-react'
import { CourseCard } from '../components/CourseCard.jsx'
import { MyCertificates } from '../components/certificates/MyCertificates.jsx'
import { PageShell } from '../components/shared.jsx'
import { useCatalog, useEnroll, useLmsPermissions, useMyCourses } from '../hooks/useLmsData.js'
import { useMyCertificates } from '../hooks/useLmsCerts.js'
import { lmsPath } from '../lib/lmsLabels.js'

const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4'

function Section({ title, description, children }) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-base font-semibold">{title}</h2>
        {description ? <p className="text-sm text-[hsl(var(--muted-foreground))]">{description}</p> : null}
      </div>
      <ul className={GRID}>{children}</ul>
    </section>
  )
}

function LoadingGrid() {
  return <div className={GRID} aria-busy="true" aria-label="Cargando cursos">{[1, 2, 3].map((key) => <Skeleton key={key} className="h-72 rounded-2xl" />)}</div>
}

export default function LmsHome() {
  const navigate = useNavigate()
  const my = useMyCourses(), catalog = useCatalog(), enroll = useEnroll(), certificates = useMyCertificates({ retry: false })
  const { canManageCourses } = useLmsPermissions()
  const open = (courseId) => navigate(lmsPath(`/learn/${courseId}`))

  const active = my.data?.active ?? []
  const completed = my.data?.completed ?? []
  const enrolledIds = new Set([...active, ...completed].map((item) => item.course.id))
  const available = (catalog.data ?? []).filter((course) => !enrolledIds.has(course.id))

  async function join(courseId) {
    try {
      await enroll.mutateAsync(courseId)
      open(courseId)
    } catch { /* toast shown by the mutation */ }
  }

  const loading = my.isLoading || catalog.isLoading
  const error = my.isError ? my.error : catalog.isError ? catalog.error : null
  const empty = !loading && !error && !active.length && !completed.length && !available.length
  return (
    <PageShell>
      <PageHeader
        eyebrow="Aprendizaje"
        title="Mis cursos"
        description="Tus cursos asignados, tu avance y el catálogo de cursos abiertos de tu empresa."
        actions={canManageCourses ? <Button variant="outline" onClick={() => navigate(lmsPath('/courses'))}><Settings2 />Administrar cursos</Button> : null}
        className="mb-2 pb-0"
      />
      {loading ? <LoadingGrid /> : null}
      {error ? <ErrorState title="No se pudieron cargar tus cursos" description={error.message} onRetry={() => { my.refetch(); catalog.refetch() }} /> : null}
      {empty ? (
        <EmptyState
          icon={GraduationCap}
          title="Aún no tienes cursos"
          description="Cuando te asignen un curso o se publique uno con inscripción libre, aparecerá aquí."
          action={canManageCourses ? <Button onClick={() => navigate(lmsPath('/courses'))}>Crear un curso</Button> : null}
        />
      ) : null}
      {!loading && active.length ? (
        <Section title="En curso">
          {active.map(({ course, enrollment }) => (
            <li key={course.id} className="flex">
              <CourseCard course={course} enrollment={enrollment} actionLabel={enrollment.progressPct ? 'Continuar' : 'Empezar'} onAction={() => open(course.id)} />
            </li>
          ))}
        </Section>
      ) : null}
      {!loading && available.length ? (
        <Section title="Catálogo" description="Cursos abiertos a los que puedes inscribirte.">
          {available.map((course) => (
            <li key={course.id} className="flex">
              <CourseCard
                course={course} enrollment={course.enrollment}
                actionLabel={course.enrollment?.status === 'dropped' ? 'Volver a inscribirme' : 'Inscribirme'}
                onAction={() => join(course.id)} pending={enroll.isPending}
              />
            </li>
          ))}
        </Section>
      ) : null}
      {!loading && completed.length ? (
        <Section title="Completados">
          {completed.map(({ course, enrollment }) => (
            <li key={course.id} className="flex">
              <CourseCard course={course} enrollment={enrollment} actionLabel="Repasar" onAction={() => open(course.id)} />
            </li>
          ))}
        </Section>
      ) : null}
      {!loading ? <MyCertificates certificates={certificates.data} /> : null}
    </PageShell>
  )
}
