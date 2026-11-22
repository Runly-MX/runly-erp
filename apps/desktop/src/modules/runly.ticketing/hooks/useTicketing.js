import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { runly } from '../../../lib/runly.js'
import { ticketingError } from '../lib/ticketingLabels.js'

export const KEY = 'ticketing'
const api = runly.ticketing
const unwrap = (r) => r?.data ?? r
export const useToken = () => useAuth().session?.access_token

function useRead(key, fn, options = {}) {
  const token = useToken()
  const { activeCompanyId } = useActiveCompany()
  return useQuery({ queryKey: [KEY, activeCompanyId, ...key], queryFn: async () => fn(token), ...options, enabled: Boolean(token) && (options.enabled ?? true) })
}

export const useEvents = () => useRead(['events'], async (t) => unwrap(await api.listEvents(t)) ?? [], { staleTime: 10_000 })
export const useEvent = (eventId) => useRead(['event', eventId], async (t) => unwrap(await api.getEvent(eventId, t)), { enabled: Boolean(eventId) && eventId !== 'new', retry: false })
export const useOrders = (eventId, query) => useRead(['orders', eventId, query], async (t) => unwrap(await api.listOrders(eventId, query, t)) ?? [], { enabled: Boolean(eventId), placeholderData: (prev) => prev })
export const useOrder = (orderId) => useRead(['order', orderId], async (t) => unwrap(await api.getOrder(orderId, t)), { enabled: Boolean(orderId), retry: false })
export const useOrderHistory = (orderId) => useRead(['order-history', orderId], async (t) => unwrap(await api.orderHistory(orderId, t)) ?? [], { enabled: Boolean(orderId) })
export const usePaymentCandidates = (orderId, enabled) => useRead(['candidates', orderId], async (t) => unwrap(await api.paymentCandidates(orderId, t)) ?? [], { enabled: Boolean(orderId) && enabled, staleTime: 0 })
export const useMembers = (eventId) => useRead(['members', eventId], async (t) => unwrap(await api.listMembers(eventId, t)) ?? [], { enabled: Boolean(eventId) })
export const usePaidProducts = () => useRead(['products'], async (t) => unwrap(await runly.catalog.listProducts(t, { pageSize: 500 })) ?? [], { staleTime: 60_000 })

// Every write refreshes Boletos (and Reservaciones/POS views that read the same seats).
// The raw response is returned: issuing calls carry `credentials` beside `data`.
export function useTicketingMutation(fn, { success } = {}) {
  const token = useToken()
  const client = useQueryClient()
  return useMutation({
    mutationFn: (vars) => fn(token, vars),
    onSuccess: (data, vars) => {
      client.invalidateQueries({ queryKey: [KEY] })
      client.invalidateQueries({ queryKey: ['bookings'] })
      const message = typeof success === 'function' ? success(data, vars) : success
      if (message) toast.success(message)
    },
    onError: (error) => toast.error(ticketingError(error)),
  })
}

// One key per logical attempt: a retry after a lost response replays it.
export const newKey = () => crypto.randomUUID()

// Check-in: functions this person controls, and one function's live board (counters
// and recent scans). The board polls so several gates see each other's entries.
export const useCheckinSessions = () => useRead(['checkin-sessions'], async (t) => unwrap(await api.checkinSessions(t)) ?? [], { staleTime: 30_000, retry: (count, error) => !error?.status && count < 2 })
export const useCheckinBoard = (sessionId) => useRead(['checkin-board', sessionId], async (t) => unwrap(await api.checkinBoard(sessionId, t)), { enabled: Boolean(sessionId), refetchInterval: 5000, retry: false })
