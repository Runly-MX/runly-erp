// A company's custom detail view (DetailViewDesigner) for one DETAIL blueprint key.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '../auth/AuthProvider'
import { runly } from '../lib/runly'

export function useDetailView(viewKey) {
  const { session } = useAuth()
  const token = session?.access_token
  const queryClient = useQueryClient()
  const queryKey = ['detail-view', viewKey]
  const query = useQuery({
    queryKey,
    queryFn: async () => (await runly.modules.detailView(viewKey, token))?.data ?? null,
    enabled: Boolean(token && viewKey),
    staleTime: 10 * 60 * 1000,
  })
  const done = (message) => (data) => {
    queryClient.setQueryData(queryKey, data?.data ?? null)
    toast.success(message)
  }
  const fail = (error) => toast.error(error?.message || 'No se pudo guardar la vista.')
  const save = useMutation({ mutationFn: (schema) => runly.modules.saveDetailView(viewKey, schema, token), onSuccess: done('Vista guardada'), onError: fail })
  const reset = useMutation({ mutationFn: () => runly.modules.resetDetailView(viewKey, token), onSuccess: done('Vista restablecida'), onError: fail })
  return { view: query.data ?? null, isLoading: query.isLoading, save, reset }
}
