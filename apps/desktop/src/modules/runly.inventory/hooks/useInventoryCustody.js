import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '../../../auth/AuthProvider'
import { runly } from '../../../lib/runly'
import {
  dataUrlToBase64,
  parseCustody,
  parseCustodyList,
  parseDeliverers,
  parseFileUrl,
  parsePublicLink,
  parseTemplates,
} from '../lib/custody-api.js'

function useToken() {
  const { session } = useAuth()
  return session?.access_token
}

const KEY = ['inventory', 'custodies']
const TEMPLATES_KEY = ['inventory', 'document-templates']

// ── Custody records ───────────────────────────────────────────────────────────

export function useCustodies(params = {}, { enabled = true } = {}) {
  const token = useToken()
  return useQuery({
    queryKey: [...KEY, 'list', params],
    queryFn: async () => parseCustodyList(await runly.inventory.custodies.list(params, token)),
    enabled: Boolean(token) && enabled,
    staleTime: 30 * 1000,
  })
}

export function useCustody(id) {
  const token = useToken()
  return useQuery({
    queryKey: [...KEY, 'detail', id],
    queryFn: async () => parseCustody(await runly.inventory.custodies.get(id, token)),
    enabled: Boolean(token) && Boolean(id),
  })
}

// Every custody mutation returns { custody }; refresh lists, the record and
// the inventory items it may have assigned or returned.
function useCustodyMutation(fn) {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (vars) => fn(vars, token),
    onSuccess: (custody) => {
      qc.invalidateQueries({ queryKey: KEY })
      if (custody?.id) qc.setQueryData([...KEY, 'detail', custody.id], custody)
      qc.invalidateQueries({ queryKey: ['inventory', 'items'] })
      qc.invalidateQueries({ queryKey: ['inventory', 'assignments'] })
    },
  })
}

export const useCreateCustody = () =>
  useCustodyMutation(async (data, token) => parseCustody(await runly.inventory.custodies.create(data, token)))

export const useUpdateCustody = () =>
  useCustodyMutation(async ({ id, ...data }, token) => parseCustody(await runly.inventory.custodies.update(id, data, token)))

// { id, rowId, patch } edits snapshot fields of one row (null restores the item value).
export const useUpdateCustodyItem = () =>
  useCustodyMutation(async ({ id, rowId, patch }, token) => parseCustody(await runly.inventory.custodies.updateItem(id, rowId, patch, token)))

// { id, role, dataUrl } draws; { id, role: 'deliverer', useSaved: true } applies the deliverer's saved signature.
export const useSignCustody = () =>
  useCustodyMutation(async ({ id, role, dataUrl, useSaved }, token) =>
    parseCustody(await runly.inventory.custodies.sign(id, useSaved ? { role, useSaved: true } : { role, pngBase64: dataUrlToBase64(dataUrl) }, token)))

export const useCompleteCustody = () =>
  useCustodyMutation(async ({ id, ...data }, token) => parseCustody(await runly.inventory.custodies.complete(id, data, token)))

export const useCancelCustody = () =>
  useCustodyMutation(async ({ id, reason }, token) => parseCustody(await runly.inventory.custodies.cancel(id, reason, token)))

export function useCustodyPublicLink() {
  const token = useToken()
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, sendEmail = false }) => parsePublicLink(await runly.inventory.custodies.publicLink(id, { sendEmail }, token)),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  })
}

// Users who can be the deliverer (only the caller without deliver_on_behalf).
export function useCustodyDeliverers({ enabled = true } = {}) {
  const token = useToken()
  return useQuery({
    queryKey: [...KEY, 'deliverers'],
    queryFn: async () => parseDeliverers(await runly.inventory.custodies.deliverers(token)),
    enabled: Boolean(token) && enabled,
    staleTime: 60 * 1000,
  })
}

export function useCustodyFileUrl() {
  const token = useToken()
  return useMutation({
    mutationFn: async ({ id, mode }) => {
      if (mode !== 'preview') return parseFileUrl(await runly.inventory.custodies.document(id, token))
      // Preview streams the file; object URLs are revoked once the new tab had time to load.
      const blob = await runly.inventory.custodies.preview(id, token)
      const url = URL.createObjectURL(blob)
      setTimeout(() => URL.revokeObjectURL(url), 60_000)
      return { url, format: blob.type === 'application/pdf' ? 'pdf' : 'office' }
    },
  })
}

// ── Document templates ────────────────────────────────────────────────────────

export function useDocumentTemplates({ enabled = true } = {}) {
  const token = useToken()
  return useQuery({
    queryKey: TEMPLATES_KEY,
    queryFn: async () => parseTemplates(await runly.inventory.documentTemplates.list({ kind: 'custody' }, token)),
    enabled: Boolean(token) && enabled,
    staleTime: 60 * 1000,
  })
}

// ── Pickers ───────────────────────────────────────────────────────────────────

export function useEmployeeOptions({ enabled = true } = {}) {
  const token = useToken()
  const query = useQuery({
    queryKey: ['hr', 'employees', 'options'],
    queryFn: () => runly.hr.listEmployees(token),
    enabled: Boolean(token) && enabled,
    staleTime: 5 * 60 * 1000,
  })
  const raw = query.data?.data ?? query.data ?? []
  const options = (Array.isArray(raw) ? raw : []).map((e) => ({
    value: e.id,
    label: [e.firstName, e.lastName].filter(Boolean).join(' ') || e.id,
    description: [e.employeeCode, e.jobTitle ?? e.position].filter(Boolean).join(' · ') || undefined,
  }))
  return { ...query, options }
}

export function useItemSearch(search, { enabled = true } = {}) {
  const token = useToken()
  return useQuery({
    queryKey: ['inventory', 'items', 'custody-picker', search],
    queryFn: async () => {
      const res = await runly.inventory.listItems({ search: search || undefined, limit: 25 }, token)
      return res?.data ?? res?.items ?? []
    },
    enabled: Boolean(token) && enabled,
    staleTime: 30 * 1000,
  })
}
