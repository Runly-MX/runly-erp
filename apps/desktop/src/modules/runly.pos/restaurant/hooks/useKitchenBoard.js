import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { runly } from '../../../../lib/runly.js'
import { useAuth } from '../../../../auth/AuthProvider.jsx'
import { classifyPosError } from '../../retail/lib/retailErrors.js'
import { createPendingCommand, pendingKey } from '../../retail/lib/pendingCommands.js'

const MAX_PAGES = 10

// The active kitchen queue. The cursor is followed while the server says there
// is more: the first page is never assumed to be all the work.
export function useKitchenBoard({ token, companyId, outletId, stationId }) {
  const query = useQuery({
    queryKey: ['pos-restaurant-kitchen', companyId, outletId, stationId ?? 'all', token],
    queryFn: async () => {
      const tickets = []
      let cursor
      let serverTime = null
      for (let page = 0; page < MAX_PAGES; page++) {
        const res = await runly.commerce.kitchenTickets({ outletId, ...(stationId ? { stationId } : {}), limit: 100, ...(cursor ? { cursor } : {}) }, token)
        tickets.push(...(res.data ?? []))
        serverTime = res.serverTime ?? serverTime
        if (!res.pagination?.hasMore || !res.pagination.nextCursor) return { tickets, serverTime, truncated: false }
        cursor = res.pagination.nextCursor
      }
      return { tickets, serverTime, truncated: true }
    },
    enabled: Boolean(token && companyId && outletId),
    refetchInterval: 5000,
    refetchIntervalInBackground: false,
    staleTime: 0,
    retry: (n, e) => ![401, 403, 404].includes(e?.status) && n < 2,
  })
  return query
}

const FINAL_STATUS = 'DELIVERED'
const NEXT = { PENDING: 'IN_PREPARATION', IN_PREPARATION: 'READY', READY: 'DELIVERED' }
export const nextStatus = (status) => NEXT[status] ?? null

// Line transitions for the kitchen. Each one is a persisted command keyed by
// the ticket line, so a lost response is retried with its original key. The
// last transition made here is remembered for the five-second undo.
export function useKitchenActions({ token, companyId, onChanged }) {
  const { userProfile } = useAuth()
  const userId = userProfile?.id
  const queryClient = useQueryClient()
  const [busy, setBusy] = useState(() => new Set())
  const [failures, setFailures] = useState({})
  const [undo, setUndo] = useState(null)
  const timer = useRef(null)
  const stores = useRef(new Map())

  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => { stores.current = new Map() }, [userId, companyId])

  const storeFor = useCallback((lineId) => {
    if (!stores.current.has(lineId)) {
      stores.current.set(lineId, createPendingCommand({
        key: pendingKey(userId, companyId, `kds-line:${lineId}`),
        metadata: { userId, companyId, prefix: 'kds-line', scope: lineId },
      }))
    }
    return stores.current.get(lineId)
  }, [userId, companyId])

  const mark = (lineId, on) => setBusy((prev) => { const next = new Set(prev); if (on) next.add(lineId); else next.delete(lineId); return next })

  const apply = useCallback(async (ticket, line, status, reason) => {
    if (!token || !userId || !companyId || busy.has(line.id)) return null
    const store = storeFor(line.id)
    const recovered = store.read()
    mark(line.id, true)
    setFailures((prev) => { const { [line.id]: _drop, ...rest } = prev; return rest })
    try {
      // A pending record with a different body is the original attempt whose
      // response was lost: resend it as it was rather than a new intent.
      const body = recovered?.body ?? { expectedVersion: line.version, status, ...(reason ? { reason } : {}) }
      const result = (await store.execute(body, (b, options) => runly.commerce.updateKitchenLine(ticket.id, line.id, b, token, options))).data
      clearTimeout(timer.current)
      if (!body.reason && ['IN_PREPARATION', 'READY'].includes(body.status)) {
        setUndo({ ticketId: ticket.id, lineId: line.id, from: line.status, line: result.line })
        timer.current = setTimeout(() => setUndo(null), 5000)
      } else setUndo(null)
      queryClient.invalidateQueries({ queryKey: ['pos-restaurant-kitchen', companyId] })
      onChanged?.(result)
      return result
    } catch (error) {
      const info = classifyPosError(error)
      setFailures((prev) => ({ ...prev, [line.id]: { ...info, status, ticketId: ticket.id } }))
      if (info.kind === 'conflict') queryClient.invalidateQueries({ queryKey: ['pos-restaurant-kitchen', companyId] })
      return null
    } finally { mark(line.id, false) }
  }, [token, userId, companyId, busy, storeFor, queryClient, onChanged])

  const undoLast = useCallback(async (ticket) => {
    const current = undo
    if (!current) return null
    setUndo(null)
    clearTimeout(timer.current)
    return apply(ticket, { id: current.lineId, version: current.line.version, status: current.line.status }, current.from, 'Toque accidental')
  }, [undo, apply])

  return { busy, failures, undo, advance: (ticket, line) => nextStatus(line.status) && apply(ticket, line, nextStatus(line.status)), undoLast, retry: (ticket, line) => apply(ticket, line, nextStatus(line.status)), final: FINAL_STATUS }
}
