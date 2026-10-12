import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { runly } from '../../../lib/runly.js'

const useToken = () => useAuth().session?.access_token
const unwrap = (response) => response?.data ?? response
const KEY = 'attendance'
const POLL_MS = 20_000

export function useAttendancePermissions() {
  const profile = useAuth().userProfile
  const permissions = profile?.permissions ?? []
  const can = (key) => Boolean(profile?.isAdmin || permissions.includes(key))
  return {
    canManagePeople: can('attendance.people.manage'),
    canManagePunches: can('attendance.punch.manage'),
    canConfigure: can('attendance.config.manage'),
  }
}

function useRead(key, fn, options = {}) {
  const token = useToken()
  return useQuery({ queryKey: [KEY, ...key], queryFn: async () => unwrap(await fn(token)), enabled: Boolean(token), ...options })
}

export const useSummary = () => useRead(['summary'], (t) => runly.attendance.getSummary(t), { refetchInterval: POLL_MS })
export const usePresence = () => useRead(['presence'], (t) => runly.attendance.getPresenceReport({}, t), { refetchInterval: POLL_MS })
export const useSettings = () => useRead(['settings'], (t) => runly.attendance.getSettings(t), { staleTime: 30_000 })
export const useKiosks = (options) => useRead(['kiosks'], (t) => runly.attendance.listKiosks(t), options)
export const useCatalog = (kind) => useRead(['catalog', kind], (t) => runly.attendance.listCatalog(kind, t), { staleTime: 30_000 })
export const usePeople = (query) => useRead(['people', query], (t) => runly.attendance.listPeople(query, t), { placeholderData: keepPreviousData })
export const usePunches = (query) => useRead(['punches', query], (t) => runly.attendance.listPunches(query, t), { placeholderData: keepPreviousData })
export const useHoursReport = (query) => useRead(['hours', query], (t) => runly.attendance.getHoursReport(query, t), { placeholderData: keepPreviousData })
export const useComplianceReport = (query) => useRead(['compliance', query], (t) => runly.attendance.getComplianceReport(query, t), { placeholderData: keepPreviousData })

// Generic mutation: runs fn(token, vars), then invalidates the whole attendance cache.
function useAction(fn, successMessage) {
  const token = useToken(), client = useQueryClient()
  return useMutation({
    mutationFn: async (vars) => unwrap(await fn(token, vars)),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: [KEY] })
      if (successMessage) toast.success(successMessage)
    },
    onError: (error) => toast.error(error.message || 'No se pudo completar la acción.'),
  })
}

export const useSaveCatalogItem = (kind) => useAction(
  (t, { id, ...data }) => (id ? runly.attendance.updateCatalogItem(kind, id, data, t) : runly.attendance.createCatalogItem(kind, data, t)),
  'Guardado.',
)
export const useDeleteCatalogItem = (kind) => useAction((t, id) => runly.attendance.deleteCatalogItem(kind, id, t))
export const useSavePerson = () => useAction(
  (t, { id, ...data }) => (id ? runly.attendance.updatePerson(id, data, t) : runly.attendance.createPerson(data, t)),
  'Persona guardada.',
)
export const useImportFromHr = () => useAction((t) => runly.attendance.importPeopleFromHr(t))
export const useEnrollInvite = () => useAction((t, personId) => runly.attendance.createEnrollInvite(personId, t))
export const useAddCard = () => useAction((t, { personId, ...data }) => runly.attendance.addCard(personId, data, t), 'Tarjeta asignada.')
export const useRevokeCredential = () => useAction((t, id) => runly.attendance.revokeCredential(id, t), 'Credencial revocada.')
export const useSaveSettings = () => useAction((t, data) => runly.attendance.saveSettings(data, t), 'Guardado.')
export const useManualPunch = () => useAction((t, data) => runly.attendance.createManualPunch(data, t), 'Checada registrada.')
export const useVoidPunch = () => useAction((t, { id, note }) => runly.attendance.voidPunch(id, { note }, t), 'Checada anulada.')
export const useSaveKiosk = () => useAction(
  (t, { id, ...data }) => (id ? runly.attendance.updateKiosk(id, data, t) : runly.attendance.createKiosk(data, t)),
  'Kiosko guardado.',
)
export const useApproveKiosk = () => useAction((t, { id, code }) => runly.attendance.approveKiosk(id, code, t), 'Kiosko aprobado.')
export const useResetKiosk = () => useAction((t, id) => runly.attendance.resetKiosk(id, t), 'Kiosko restablecido.')
export const useRevokeKiosk = () => useAction((t, id) => runly.attendance.revokeKiosk(id, t), 'Kiosko revocado.')

// HR link: suggestions are keyed by the typed text; link/unlink refresh the whole attendance cache.
export const useHrSuggestions = (q) => useRead(
  ['hr-suggestions', q],
  (t) => runly.attendance.searchHrSuggestions({ q, limit: 6 }, t),
  { enabled: Boolean(useToken()) && (q ?? '').trim().length >= 2, staleTime: 15_000, placeholderData: keepPreviousData },
)
export const useLinkHr = () => useAction(
  (t, { personId, hrEmployeeId, syncProfile }) => runly.attendance.linkHr(personId, { hrEmployeeId, syncProfile: Boolean(syncProfile) }, t),
  'Persona vinculada con RH.',
)
export const useUnlinkHr = () => useAction((t, personId) => runly.attendance.unlinkHr(personId, t), 'Vínculo con RH eliminado.')
