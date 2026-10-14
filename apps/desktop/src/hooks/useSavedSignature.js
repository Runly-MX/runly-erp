import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../auth/AuthProvider'
import { runly } from '../lib/runly'
import { parseSavedSignature } from '../lib/savedSignature.js'

export const SAVED_SIGNATURE_KEY = ['profile', 'signature']

const toBase64 = (dataUrl) => String(dataUrl ?? '').replace(/^data:image\/png;base64,/, '')

// The current user's saved signature plus save / delegation / delete mutations.
export function useSavedSignature({ enabled = true } = {}) {
  const { session } = useAuth()
  const token = session?.access_token
  const qc = useQueryClient()
  const query = useQuery({
    queryKey: SAVED_SIGNATURE_KEY,
    queryFn: async () => parseSavedSignature(await runly.profile.getSignature(token)),
    enabled: Boolean(token) && enabled,
    staleTime: 60 * 1000,
  })
  const onSuccess = (signature) => {
    qc.setQueryData(SAVED_SIGNATURE_KEY, signature)
    qc.invalidateQueries({ queryKey: ['inventory', 'custodies', 'deliverers'] })
  }
  const save = useMutation({
    mutationFn: async ({ dataUrl, allowDelegation }) =>
      parseSavedSignature(await runly.profile.saveSignature({ pngBase64: toBase64(dataUrl), allowDelegation }, token)),
    onSuccess,
  })
  const setDelegation = useMutation({
    mutationFn: async (allowDelegation) => parseSavedSignature(await runly.profile.updateSignature({ allowDelegation }, token)),
    onSuccess,
  })
  const remove = useMutation({
    mutationFn: async () => { await runly.profile.deleteSignature(token); return null },
    onSuccess,
  })
  return { ...query, signature: query.data ?? null, save, setDelegation, remove }
}
