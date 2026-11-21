import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Alert, AlertDescription, Button, ChipTabPanel, ChipTabs, ConfirmDialog, ErrorState, PageHeader, Skeleton } from '@runly/ui'
import { Archive, EyeOff, Globe, ListChecks, RotateCcw, Settings2, Users } from 'lucide-react'
import { ActivitiesPanel } from '../components/assessment/ActivitiesPanel.jsx'
import { AssessmentStatusBadge } from '../components/assessment/AssessmentParts.jsx'
import { AssessmentSettingsForm } from '../components/assessment/AssessmentSettingsForm.jsx'
import { ParticipantsPanel } from '../components/assessment/ParticipantsPanel.jsx'
import { PageShell, useRouteId } from '../components/shared.jsx'
import { useArchiveAssessment, useAssessment, useUpdateAssessment } from '../hooks/useLmsAssessments.js'
import { useLmsPermissions } from '../hooks/useLmsData.js'
import { assessmentsPath, formatPoints, formatTimeLimit } from '../lib/lmsAssessment.js'

const TABS = [
  { value: 'activities', label: 'Actividades', icon: ListChecks, description: 'Cuestionarios, entregas y actividades prácticas, en el orden en que se presentan.' },
  { value: 'settings', label: 'Configuración', icon: Settings2, description: 'Instrucciones, tiempo límite, intentos, disponibilidad y resultados.' },
  { value: 'participants', label: 'Participantes', icon: Users, description: 'Quiénes la presentan, cuándo empezaron y cuándo entregaron.' },
]

// Evaluation editor: /assessments/:id. Sharing, results and graders arrive in later phases.
export default function LmsAssessmentEditor() {
  const navigate = useNavigate()
  const id = useRouteId()
  const query = useAssessment(id)
  const publish = useUpdateAssessment('Evaluación publicada.'), unpublish = useUpdateAssessment('La evaluación volvió a borrador.')
  const archive = useArchiveAssessment()
  const [tab, setTab] = useState('activities')
  const [confirmArchive, setConfirmArchive] = useState(false)
  const { canManageEnrollments } = useLmsPermissions()
  const back = () => navigate(assessmentsPath())

  if (query.isLoading) {
    return <PageShell><PageHeader title="Evaluación" loading onBack={back} backLabel="Evaluaciones" className="mb-2 pb-0" /><Skeleton className="h-10 w-80 rounded-md" /><Skeleton className="h-64 rounded-2xl" /></PageShell>
  }
  if (query.isError || !query.data) {
    return (
      <PageShell>
        <PageHeader title="Evaluación" onBack={back} backLabel="Evaluaciones" className="mb-2 pb-0" />
        <ErrorState title={query.error?.status === 404 ? 'La evaluación no existe' : 'No se pudo cargar la evaluación'} description={query.error?.message} onRetry={() => query.refetch()} />
      </PageShell>
    )
  }

  const { assessment, activities } = query.data
  const archived = assessment.status === 'archived'
  const setStatus = async (mutation, status) => { try { await mutation.mutateAsync({ id: assessment.id, status }) } catch { /* toast shown */ } }
  async function doArchive() {
    try { await archive.mutateAsync(assessment.id); setConfirmArchive(false) } catch { /* toast shown */ }
  }

  const actions = (
    <>
      {assessment.status === 'draft' ? <Button onClick={() => setStatus(publish, 'published')} disabled={publish.isPending}><Globe />Publicar</Button> : null}
      {assessment.status === 'published' ? <Button variant="outline" onClick={() => setStatus(unpublish, 'draft')} disabled={unpublish.isPending}><EyeOff />Despublicar</Button> : null}
      {archived ? <Button variant="outline" onClick={() => setStatus(unpublish, 'draft')} disabled={unpublish.isPending}><RotateCcw />Restaurar</Button> : null}
      {!archived ? <Button variant="outline" onClick={() => setConfirmArchive(true)} className="text-[hsl(var(--destructive))]"><Archive />Archivar</Button> : null}
    </>
  )

  return (
    <PageShell>
      <PageHeader
        onBack={back} backLabel="Evaluaciones" eyebrow="Aprendizaje · Evaluación" title={assessment.title}
        description={(
          <span className="inline-flex flex-wrap items-center gap-2">
            <AssessmentStatusBadge status={assessment.status} />
            <span className="tabular-nums">
              {assessment.activityCount} {assessment.activityCount === 1 ? 'actividad' : 'actividades'} · {formatPoints(assessment.maxPoints)} · {formatTimeLimit(assessment.settings?.timeLimitMinutes)}
            </span>
          </span>
        )}
        actions={actions} collapseOnScroll sticky className="mb-2 pb-0"
      />
      {archived ? (
        <Alert><AlertDescription>Esta evaluación está archivada: ya no se puede presentar. Restáurala para editarla.</AlertDescription></Alert>
      ) : assessment.status === 'draft' ? (
        <Alert><AlertDescription>Borrador: nadie puede presentarla hasta que la publiques.</AlertDescription></Alert>
      ) : null}
      <ChipTabs tabs={canManageEnrollments ? TABS : TABS.filter((item) => item.value !== 'participants')} value={tab} onChange={setTab} tone="violet" ariaLabel="Secciones de la evaluación" />
      <ChipTabPanel value="activities" active={tab === 'activities'}>
        <ActivitiesPanel assessmentId={assessment.id} activities={activities} readOnly={archived} />
      </ChipTabPanel>
      <ChipTabPanel value="settings" active={tab === 'settings'}>
        <AssessmentSettingsForm assessment={assessment} readOnly={archived} />
      </ChipTabPanel>
      {canManageEnrollments ? (
        <ChipTabPanel value="participants" active={tab === 'participants'}>
          <ParticipantsPanel assessmentId={assessment.id} readOnly={archived} />
        </ChipTabPanel>
      ) : null}
      <ConfirmDialog
        open={confirmArchive} onOpenChange={setConfirmArchive} icon={Archive} title="Archivar evaluación"
        description={`«${assessment.title}» dejará de estar disponible. Sus actividades y resultados se conservan.`}
        confirmLabel="Archivar" loading={archive.isPending} onConfirm={doArchive}
      />
    </PageShell>
  )
}
