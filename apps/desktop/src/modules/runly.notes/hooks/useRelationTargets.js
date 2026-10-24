import { useQuery } from '@tanstack/react-query'
import { useAuth } from '../../../auth/AuthProvider'
import { runly } from '../../../lib/runly'

// Resolve requests for the same type issued in the same tick (a note with many
// chips mounting at once) are merged into one POST.
const pending = new Map()

function resolveBatched(type, id, token) {
  return new Promise((resolve, reject) => {
    let batch = pending.get(type)
    if (!batch) {
      batch = { waiters: new Map() }
      pending.set(type, batch)
      queueMicrotask(async () => {
        pending.delete(type)
        const ids = [...batch.waiters.keys()]
        try {
          const res = await runly.relationTargets.resolve(type, ids, token)
          const byId = new Map((res?.data ?? []).map((row) => [String(row.id), row]))
          for (const [waiterId, callbacks] of batch.waiters) {
            const row = byId.get(String(waiterId)) ?? null
            callbacks.forEach((cb) => cb.resolve(row))
          }
        } catch (error) {
          for (const callbacks of batch.waiters.values()) callbacks.forEach((cb) => cb.reject(error))
        }
      })
    }
    const list = batch.waiters.get(id) ?? []
    list.push({ resolve, reject })
    batch.waiters.set(id, list)
  })
}

export function useReferenceSearch(type, q) {
  const { session } = useAuth()
  const token = session?.access_token
  return useQuery({
    queryKey: ['note-ref-search', type, q],
    queryFn: async () => (await runly.relationTargets.search(type, q, token))?.data ?? [],
    enabled: Boolean(token) && Boolean(type),
    staleTime: 15_000,
    retry: false,
  })
}

// Live label for a reference chip. The API only returns records the viewer may
// see, so `data` is null when the record is gone or not accessible.
export function useResolvedReference(type, id, { enabled = true } = {}) {
  const { session } = useAuth()
  const token = session?.access_token
  const query = useQuery({
    queryKey: ['note-ref', type, id],
    queryFn: async () => {
      const row = await resolveBatched(type, id, token)
      return row ? { title: row.title, subtitle: row.subtitle ?? null, url: row.url ?? null } : null
    },
    enabled: enabled && Boolean(token) && Boolean(type) && Boolean(id),
    staleTime: 60_000,
    retry: false,
  })
  return { data: query.data ?? null, status: query.status }
}
