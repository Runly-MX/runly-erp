import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../../auth/AuthProvider'
import { runly } from '../../../lib/runly'

function useToken() {
  const { session } = useAuth()
  return session?.access_token
}

// Imperative helpers for the scan kiosk (reads are not cached queries: every
// read must hit the API so a revoked link or a changed status shows up).
export function useScanApi() {
  const token = useToken()
  return {
    // codes (<= 50) -> [{ code, item, matchedBy }]
    resolve: async (codes) => {
      const res = await runly.inventory.scan.resolve(codes, token)
      return res?.data ?? []
    },
    exportXlsx: (table) => runly.inventory.scan.exportXlsx(table, token),
  }
}

// Signed URL of an item's cover image (card variant).
export function useScanCoverUrl(fileId) {
  const token = useToken()
  return useQuery({
    queryKey: ['inventory', 'scan-cover', fileId],
    queryFn: async () => (await runly.files.getSignedUrl(fileId, token, { variant: 'card' }))?.data?.signedUrl ?? null,
    enabled: Boolean(fileId && token),
    staleTime: 50 * 60 * 1000,
  })
}
