import { useEffect, useState } from 'react'
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { useAuth } from '../../../auth/AuthProvider'
import { runly } from '../../../lib/runly'
import { MAX_SELECTION } from '../lib/label-queue.js'

const PAGE_SIZE = 50
const unwrap = (res) => res?.data ?? res

function useToken() {
  const { session } = useAuth()
  return session?.access_token
}

export function useDebouncedValue(value, delay = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// Same endpoint and search as the Inventario list (GET /inventory/items?search=,
// inventory-search-service): paginated, previous results kept while typing.
const listParams = ({ search, labeled, categoryId, locationId }) => ({
  search: search?.trim() || undefined,
  labeled: labeled === 'all' ? undefined : labeled,
  categoryId: categoryId || undefined,
  locationId: locationId || undefined,
})

// pageSize: 50 for the Etiquetas picker, a few rows for the Escanear suggestions.
export function useLabelAssetSearch(filters, { enabled = true, pageSize = PAGE_SIZE } = {}) {
  const token = useToken()
  const params = listParams(filters)
  return useInfiniteQuery({
    queryKey: ['inventory', 'items', 'label-picker', params, pageSize],
    queryFn: async ({ pageParam }) => runly.inventory.listItems({ ...params, page: pageParam, limit: pageSize }, token),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const page = Number(last?.page ?? 1)
      const limit = Number(last?.limit ?? pageSize)
      return page * limit < Number(last?.total ?? 0) ? page + 1 : undefined
    },
    placeholderData: keepPreviousData,
    enabled: Boolean(token) && enabled,
    staleTime: 30 * 1000,
  })
}

// Every item of the current filter (for "Seleccionar todos"), capped at MAX_SELECTION.
export function useFetchAllFiltered() {
  const token = useToken()
  return async (filters) => {
    const params = listParams(filters)
    const out = []
    for (let page = 1; out.length < MAX_SELECTION; page += 1) {
      const res = await runly.inventory.listItems({ ...params, page, limit: 200 }, token)
      const rows = res?.data ?? []
      out.push(...rows)
      if (rows.length < 200 || out.length >= Number(res?.total ?? 0)) break
    }
    return out.slice(0, MAX_SELECTION)
  }
}

// Signed thumbnail URLs for a page of rows in one request -> { [fileId]: url }.
export function useCoverUrls(fileIds) {
  const token = useToken()
  const ids = [...new Set(fileIds.filter(Boolean))].sort()
  return useQuery({
    queryKey: ['inventory', 'label-picker', 'covers', ids],
    queryFn: async () => unwrap(await runly.files.batchSignedUrls(ids, token, { variant: 'card' })) ?? {},
    enabled: Boolean(token && ids.length),
    staleTime: 40 * 60 * 1000,
    placeholderData: keepPreviousData,
  })
}

// Company print log (Etiquetas > Historial), newest first.
export function useLabelPrintLog({ enabled = true } = {}) {
  const token = useToken()
  return useInfiniteQuery({
    queryKey: ['inventory', 'labels', 'print-log'],
    queryFn: async ({ pageParam }) => runly.inventory.labels.listPrints({ page: pageParam, limit: 100 }, token),
    initialPageParam: 1,
    getNextPageParam: (last) => (Number(last?.page ?? 1) * Number(last?.limit ?? 100) < Number(last?.total ?? 0) ? Number(last.page) + 1 : undefined),
    enabled: Boolean(token) && enabled,
    staleTime: 15 * 1000,
  })
}
