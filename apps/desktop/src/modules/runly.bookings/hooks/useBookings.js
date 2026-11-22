import { useCallback, useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { runly } from '../../../lib/runly.js'
import { bookingsError } from '../lib/bookingsLabels.js'

export const KEY = 'bookings'
const api = runly.bookings
const unwrap = (response) => response?.data ?? response
export const useToken = () => useAuth().session?.access_token

function useRead(key, fn, options = {}) {
  const token = useToken()
  const { activeCompanyId } = useActiveCompany()
  return useQuery({
    queryKey: [KEY, activeCompanyId, ...key],
    queryFn: async () => fn(token),
    ...options,
    enabled: Boolean(token) && (options.enabled ?? true),
  })
}

export const useBookingsMe = () => useRead(['me'], async (t) => unwrap(await api.me(t)), { staleTime: 30_000 })
export const useSpaces = () => useRead(['spaces'], async (t) => unwrap(await api.listSpaces(t)) ?? [], { staleTime: 15_000 })
export const useSpace = (spaceId) => useRead(['space', spaceId], async (t) => unwrap(await api.getSpace(spaceId, t)), { enabled: Boolean(spaceId), retry: false })
export const useSummary = (spaceId) => useRead(['summary', spaceId], async (t) => unwrap(await api.getSummary(spaceId, t)), { enabled: Boolean(spaceId) })
export const useServices = (spaceId) => useRead(['services', spaceId], async (t) => unwrap(await api.listServices(spaceId, t)) ?? [], { enabled: Boolean(spaceId) })
export const useResources = (options = {}) => useRead(['resources'], async (t) => unwrap(await api.listResources(t)) ?? [], { retry: false, ...options })
export const useSpaceResourceIds = (spaceId) => useRead(['space-resources', spaceId], async (t) => unwrap(await api.listSpaceResources(spaceId, t)) ?? [], { enabled: Boolean(spaceId) })
export const useServiceResourceIds = (serviceId) => useRead(['service-resources', serviceId], async (t) => unwrap(await api.listServiceResources(serviceId, t)) ?? [], { enabled: Boolean(serviceId) })
export const useSchedule = (spaceId) => useRead(['schedule', spaceId], async (t) => unwrap(await api.getSchedule(spaceId, t)) ?? [], { enabled: Boolean(spaceId) })
export const useResourceSchedule = (resourceId) => useRead(['resource-schedule', resourceId], async (t) => unwrap(await api.getResourceSchedule(resourceId, t)) ?? [], { enabled: Boolean(resourceId) })
export const useExceptions = (spaceId, query) => useRead(['exceptions', spaceId, query], async (t) => unwrap(await api.listExceptions(spaceId, query, t)) ?? [], { enabled: Boolean(spaceId) })
export const useSessions = (spaceId, query) => useRead(['sessions', spaceId, query], async (t) => unwrap(await api.listSessions(spaceId, query, t)) ?? [], { enabled: Boolean(spaceId) })
export const useMembers = (spaceId) => useRead(['members', spaceId], async (t) => unwrap(await api.listMembers(spaceId, t)) ?? [], { enabled: Boolean(spaceId) })
export const useAvailability = (spaceId, query) => useRead(['availability', spaceId, query], async (t) => unwrap(await api.availability(spaceId, query, t)), {
  enabled: Boolean(spaceId && query?.serviceId && query?.from && query?.to), staleTime: 0, refetchOnWindowFocus: true,
})
export const useReservations = (spaceId, query) => useRead(['reservations', spaceId, query], async (t) => {
  const res = await api.listReservations(spaceId, query, t)
  return { items: res?.data ?? [], total: res?.total ?? 0 }
}, { enabled: Boolean(spaceId), placeholderData: keepPreviousData })
export const useReservation = (bookingId) => useRead(['reservation', bookingId], async (t) => unwrap(await api.getReservation(bookingId, t)), { enabled: Boolean(bookingId), retry: false })
export const useHistory = (bookingId) => useRead(['history', bookingId], async (t) => unwrap(await api.getHistory(bookingId, t)) ?? [], { enabled: Boolean(bookingId) })

// Mutations refresh every bookings query of the company: availability and the
// agenda must reflect what the engine just committed.
export function useBookingsMutation(fn, { success, fallback } = {}) {
  const token = useToken(), client = useQueryClient()
  return useMutation({
    mutationFn: async (vars) => unwrap(await fn(token, vars)),
    onSuccess: (data, vars) => {
      client.invalidateQueries({ queryKey: [KEY] })
      const message = typeof success === 'function' ? success(data, vars) : success
      if (message) toast.success(message)
    },
    onError: (error) => {
      toast.error(bookingsError(error, fallback))
      // Lost a race for capacity or a stale version: show what the engine has now.
      if (['SLOT_TAKEN', 'SESSION_FULL', 'SESSION_UNAVAILABLE', 'VERSION_CONFLICT', 'INVALID_TRANSITION'].includes(error?.code)) client.invalidateQueries({ queryKey: [KEY] })
    },
  })
}

// Same payload in the same dialog session -> same key: a retry after a lost
// response replays the committed result instead of booking twice.
export function useIdempotencyKey(open) {
  const [session, setSession] = useState(() => crypto.randomUUID())
  useEffect(() => { if (open) setSession(crypto.randomUUID()) }, [open])
  return useCallback((payload) => {
    let hash = 2166136261
    for (const ch of JSON.stringify(payload)) hash = Math.imul(hash ^ ch.charCodeAt(0), 16777619)
    return `${session}:${(hash >>> 0).toString(36)}`
  }, [session])
}

const STORAGE = 'runly-bookings-space'
// Selected space shared by Agenda and Reservaciones: URL first (?space=), then the
// last one used in this company, then the first one the person can see.
export function useSelectedSpace(spaces) {
  const { activeCompanyId } = useActiveCompany()
  const [params, setParams] = useSearchParams()
  const storageKey = `${STORAGE}:${activeCompanyId}`
  const fromUrl = params.get('space')
  const stored = (() => { try { return localStorage.getItem(storageKey) } catch { return null } })()
  const ids = useMemo(() => (spaces ?? []).filter((s) => s.enabled !== false).map((s) => s.id), [spaces])
  const spaceId = [fromUrl, stored, ids[0]].find((id) => id && ids.includes(id)) ?? null
  const select = useCallback((id) => {
    try { localStorage.setItem(storageKey, id) } catch { /* private mode */ }
    setParams((current) => { const next = new URLSearchParams(current); next.set('space', id); return next }, { replace: true })
  }, [setParams, storageKey])
  return [spaceId, select]
}

export function useBookingRole(space) {
  const role = space?.role ?? null
  return { role, canOperate: role === 'admin' || role === 'agent', canConfigure: role === 'admin' }
}

// Rooms and equipment reserved by employees (v1.2 R1). The agenda refreshes often:
// colleagues reserve the same rooms.
export const useRooms = (options = {}) => useRead(['rooms'], async (t) => unwrap(await api.listRooms(t)) ?? [], { staleTime: 30_000, retry: false, ...options })
export const useMyRoomReservations = () => useRead(['rooms-mine'], async (t) => unwrap(await api.myRoomReservations(t)) ?? [], { staleTime: 10_000 })
export const useRoomAgenda = (spaceId, from, to) => useRead(['rooms-agenda', spaceId, from, to], async (t) => unwrap(await api.roomAgenda(spaceId, { from, to }, t)), {
  enabled: Boolean(spaceId && from && to), refetchInterval: 30_000, placeholderData: keepPreviousData,
})
