import { useQuery } from '@tanstack/react-query'
import { runly } from '../../../lib/runly.js'

// Capabilities and export notice published by the API. A failure only hides the
// native package option; it never blocks the rest of Studio.
export function useInterchangeContract({ token, scopeKey }) {
  return useQuery({
    queryKey: ['studio', ...scopeKey, 'interchange-contract'], enabled: Boolean(token), staleTime: 300_000, retry: false, refetchOnWindowFocus: false,
    queryFn: async ({ signal }) => { const response = await runly.studio.packageContract(token, signal); return response?.data ?? response },
  })
}
