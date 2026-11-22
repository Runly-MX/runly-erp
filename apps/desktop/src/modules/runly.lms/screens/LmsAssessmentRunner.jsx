import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, ErrorState, Skeleton } from '@runly/ui'
import { ArrowLeft } from 'lucide-react'
import { RunnerIntro } from '../components/runner/RunnerParts.jsx'
import { Centered, SessionView } from '../components/runner/SessionView.jsx'
import { useRouteId } from '../components/shared.jsx'
import { useAssessmentOverview, useStartSession } from '../hooks/useLmsSession.js'
import { lmsPath } from '../lib/lmsLabels.js'

// /evaluate/:id — the participant side of an evaluation (full screen).
export default function LmsAssessmentRunner() {
  const navigate = useNavigate()
  const id = useRouteId()
  const overview = useAssessmentOverview(id)
  const start = useStartSession(id)
  const [startedId, setStartedId] = useState(null)
  const exit = () => navigate(lmsPath('/'))

  if (overview.isLoading) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-1/2" /><Skeleton className="h-64 rounded-2xl" /></div>
  if (overview.isError || !overview.data) {
    return (
      <Centered>
        <ErrorState
          title={overview.error?.status === 403 ? 'No estás registrado en esta evaluación' : overview.error?.status === 404 ? 'La evaluación no existe' : 'No se pudo cargar la evaluación'}
          description={overview.error?.message} onRetry={() => overview.refetch()}
        />
      </Centered>
    )
  }
  const data = overview.data
  const sessionId = startedId ?? data.openSessionId ?? (!data.canStart && data.sessions[0]?.id) ?? null
  if (sessionId) return <div className="h-full overflow-y-auto"><SessionView sessionId={sessionId} onExit={exit} /></div>

  async function begin() {
    try {
      const result = await start.mutateAsync()
      setStartedId(result?.session?.id ?? null)
    } catch { /* toast shown */ }
  }
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl px-4 pt-4 sm:px-6">
        <Button variant="ghost" size="sm" onClick={exit}><ArrowLeft />Aprendizaje</Button>
      </div>
      <RunnerIntro overview={data} onStart={begin} starting={start.isPending} />
    </div>
  )
}
