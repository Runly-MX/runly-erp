import { useQuery } from '@tanstack/react-query'
import { runly } from '../../../lib/runly.js'

// Modalities of the company's outlets and the appointments switch, for the
// POS sidebar only.
export function usePosNavModes({ enabled, token, companyId }) {
  const query = useQuery({
    queryKey: ['pos-nav-modes', companyId, token],
    queryFn: () => runly.commerce.context({}, token),
    enabled: Boolean(enabled && token && companyId),
    staleTime: 60_000,
    retry: false,
  })
  const data = query.data?.data
  return { modes: data?.outlets?.map((o) => o.mode) ?? null, appointments: Boolean(data?.appointmentsEnabled) }
}
