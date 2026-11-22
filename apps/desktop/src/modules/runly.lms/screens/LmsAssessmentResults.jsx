import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@runly/ui'
import { ResultsPanel } from '../components/results/ResultsPanel.jsx'
import { PageShell, useRouteId } from '../components/shared.jsx'
import { useAssessmentResults } from '../hooks/useLmsResults.js'
import { resultsPath } from '../lib/lmsAssessment.js'

// /results/:assessmentId: the participants panel for reviewers (also shown
// inside the evaluation editor for managers).
export default function LmsAssessmentResults() {
  const navigate = useNavigate()
  const id = useRouteId()
  const query = useAssessmentResults(id)
  return (
    <PageShell>
      <PageHeader
        onBack={() => navigate(resultsPath())} backLabel="Resultados" eyebrow="Resultados de evaluación"
        title={query.data?.assessment?.title ?? 'Evaluación'} loading={query.isLoading}
        description={query.error?.status === 403 ? 'No estás autorizado para ver los resultados de esta evaluación.' : undefined}
      />
      {query.error?.status === 403 ? null : <ResultsPanel assessmentId={id} />}
    </PageShell>
  )
}
