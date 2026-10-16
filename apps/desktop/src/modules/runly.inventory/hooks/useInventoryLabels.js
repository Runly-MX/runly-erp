import { useEffect, useRef, useState } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../../auth/AuthProvider'
import { runly } from '../../../lib/runly'
import { statsFromHistory } from '../lib/label-queue.js'

function useToken() {
  const { session } = useAuth()
  return session?.access_token
}

const KEY = ['inventory', 'labels']
const unwrap = (res) => res?.data ?? res

export function useLabelTemplates({ enabled = true } = {}) {
  const token = useToken()
  return useQuery({
    queryKey: [...KEY, 'templates'],
    queryFn: async () => unwrap(await runly.inventory.labels.listTemplates(token)) ?? [],
    enabled: Boolean(token) && enabled,
    staleTime: 60 * 1000,
  })
}

export function useLabelPrinters({ enabled = true } = {}) {
  const token = useToken()
  return useQuery({
    queryKey: [...KEY, 'printers'],
    queryFn: async () => unwrap(await runly.inventory.labels.listPrinters(token)) ?? [],
    enabled: Boolean(token) && enabled,
    staleTime: 60 * 1000,
  })
}

function useLabelMutation(fn, invalidate) {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (vars) => unwrap(await fn(vars, token)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, invalidate] }),
  })
}

export const useSaveLabelTemplate = () => useLabelMutation(
  ({ id, ...data }, token) => (id ? runly.inventory.labels.updateTemplate(id, data, token) : runly.inventory.labels.createTemplate(data, token)),
  'templates',
)
export const useDeleteLabelTemplate = () => useLabelMutation((id, token) => runly.inventory.labels.deleteTemplate(id, token), 'templates')
export const useSaveLabelPrinter = () => useLabelMutation(
  ({ id, ...data }, token) => (id ? runly.inventory.labels.updatePrinter(id, data, token) : runly.inventory.labels.createPrinter(data, token)),
  'printers',
)
export const useDeleteLabelPrinter = () => useLabelMutation((id, token) => runly.inventory.labels.deletePrinter(id, token), 'printers')

// Imperative render (print/download): resolves to the generated Blob.
export function useRenderLabels() {
  const token = useToken()
  return useMutation({ mutationFn: (body) => runly.inventory.labels.render(body, token) })
}

// Registers a print only after the user actually printed or downloaded.
export function useRegisterLabelPrints() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (body) => unwrap(await runly.inventory.labels.registerPrints(body, token)),
    onSuccess: (_, body) => {
      qc.invalidateQueries({ queryKey: ['inventory', 'items'] })
      qc.invalidateQueries({ queryKey: [...KEY, 'print-log'] })
      for (const row of body?.items ?? []) qc.invalidateQueries({ queryKey: [...KEY, 'history', row.itemId] })
    },
  })
}

export function useItemLabelHistory(itemId, { enabled = true } = {}) {
  const token = useToken()
  return useQuery({
    queryKey: [...KEY, 'history', itemId],
    queryFn: async () => unwrap(await runly.inventory.labels.itemHistory(itemId, token)) ?? [],
    enabled: Boolean(token && itemId) && enabled,
    staleTime: 30 * 1000,
  })
}

// Label stats for queue rows whose source did not carry them -> { [id]: stats }.
export function useQueueLabelStats(itemIds, { enabled = true } = {}) {
  const token = useToken()
  const results = useQueries({
    queries: itemIds.map((itemId) => ({
      queryKey: [...KEY, 'history', itemId],
      queryFn: async () => unwrap(await runly.inventory.labels.itemHistory(itemId, token)) ?? [],
      enabled: Boolean(token) && enabled,
      staleTime: 30 * 1000,
    })),
  })
  const stats = {}
  results.forEach((result, index) => { if (result.data) stats[itemIds[index]] = statsFromHistory(result.data) })
  return stats
}

// Items for a ?items=a,b deep link (the list has no id filter).
export function useItemsByIds(itemIds) {
  const token = useToken()
  return useQueries({
    queries: itemIds.map((id) => ({
      queryKey: ['inventory', 'items', id],
      queryFn: () => runly.inventory.getItem(id, token),
      enabled: Boolean(token),
      staleTime: 5 * 60 * 1000,
    })),
  })
}

// Debounced PNG preview from POST /inventory/labels/render. Returns
// { url, loading, error, overflow } (overflow = truncated text lines of the
// previewed label); the object URL is revoked when replaced or unmounted.
export function useLabelPreview(body, { enabled = true, delay = 400 } = {}) {
  const token = useToken()
  const [state, setState] = useState({ url: null, loading: false, error: null, overflow: 0 })
  const urlRef = useRef(null)
  const key = enabled && body ? JSON.stringify(body) : null

  useEffect(() => {
    if (!key || !token) {
      setState((s) => ({ ...s, loading: false }))
      return undefined
    }
    let cancelled = false
    setState((s) => ({ ...s, loading: true }))
    const timer = setTimeout(async () => {
      try {
        const { blob, overflow } = await runly.inventory.labels.renderWithMeta(JSON.parse(key), token)
        if (cancelled) return
        const url = URL.createObjectURL(blob)
        if (urlRef.current) URL.revokeObjectURL(urlRef.current)
        urlRef.current = url
        setState({ url, loading: false, error: null, overflow })
      } catch (err) {
        if (!cancelled) setState((s) => ({ ...s, loading: false, error: err?.message ?? 'No se pudo generar la vista previa' }))
      }
    }, delay)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [key, token, delay])

  useEffect(() => () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current) }, [])
  return state
}

// ── Public item link and page settings ─────────────────────────────────────
export function useItemPublicLink(itemId, { enabled = true } = {}) {
  const token = useToken()
  return useQuery({
    queryKey: [...KEY, 'public-link', itemId],
    queryFn: async () => unwrap(await runly.inventory.labels.publicLink(itemId, token)),
    enabled: Boolean(token && itemId) && enabled,
    staleTime: 5 * 60 * 1000,
  })
}

export function useRevokePublicLink(itemId) {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => unwrap(await runly.inventory.labels.revokePublicLink(itemId, token)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'public-link', itemId] }),
  })
}

export function useRevokeAllPublicLinks() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => unwrap(await runly.inventory.labels.revokeAllPublicLinks(token)),
    onSuccess: () => qc.invalidateQueries({ queryKey: [...KEY, 'public-link'] }),
  })
}

export function usePublicPageSettings({ enabled = true } = {}) {
  const token = useToken()
  return useQuery({
    queryKey: [...KEY, 'public-settings'],
    queryFn: async () => unwrap(await runly.inventory.labels.getPublicSettings(token)),
    enabled: Boolean(token) && enabled,
    staleTime: 60 * 1000,
  })
}

export const useSavePublicPageSettings = () => useLabelMutation((data, token) => runly.inventory.labels.updatePublicSettings(data, token), 'public-settings')
