import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { runly } from '../../../../lib/runly.js'
import { classifyPosError } from '../../retail/lib/retailErrors.js'
import { createOrderWorkflow, pendingKey } from '../../retail/lib/pendingCommands.js'
import { TERMINAL_ORDER_STATUSES } from '../lib/restaurantRules.js'

const lost = { kind: 'lost', retrySameKey: true, message: 'Hay una operación sin confirmar. Reintenta para recuperar exactamente el intento original.' }

// The account of one table. Every edit is a journaled command (path, body and
// attempt key frozen before sending), so a lost response is retried with the
// original key and the server replays the confirmed result. The order itself
// is read back from the server; nothing about the sequence of sends is kept
// only on the client.
export function useTableOrder({ token, userId, companyId, outletId, table }) {
  const queryClient = useQueryClient()
  const tableId = table?.id ?? null
  const journalKey = pendingKey(userId, companyId, `table-order:${tableId}`)
  const [localOrderId, setLocalOrderId] = useState(null)
  const [pending, setPending] = useState(null)
  const [failure, setFailure] = useState(null)
  const scopeRef = useRef(journalKey)
  const flight = useRef(null)
  useLayoutEffect(() => { scopeRef.current = journalKey }, [journalKey])

  const orderId = table?.activeOrderId ?? localOrderId
  const queryKey = useMemo(() => ['pos-restaurant-order', companyId, orderId, token], [companyId, orderId, token])

  const setOrder = useCallback((dto) => {
    queryClient.cancelQueries({ queryKey: ['pos-restaurant-order', companyId, dto.id, token] }, { revert: false })
    queryClient.setQueryData(['pos-restaurant-order', companyId, dto.id, token], { data: dto })
    if (scopeRef.current === journalKey) setLocalOrderId(dto.id)
    queryClient.invalidateQueries({ queryKey: ['pos-restaurant-tables', companyId] })
  }, [companyId, queryClient, token, journalKey])

  const workflow = useMemo(() => createOrderWorkflow({
    key: journalKey,
    metadata: { userId, companyId, tableId, prefix: 'table-order' },
    onOrder: setOrder,
    send: (step) => {
      if (localStorage.getItem('runly-active-company') !== companyId) throw Object.assign(new Error('La empresa activa cambió.'), { code: 'company_changed', status: 409 })
      const options = { idempotencyKey: step.key }
      if (step.action === 'createOrder') return runly.commerce.createOrder(step.body, token, options)
      if (step.action === 'addLine') return runly.commerce.addLine(step.orderId, step.body, token, options)
      return runly.commerce[step.action](step.orderId, step.lineId, step.body, token, options)
    },
  }), [journalKey, userId, companyId, tableId, token, setOrder])

  useEffect(() => {
    setLocalOrderId(null)
    setFailure(workflow.read() ? lost : null)
  }, [workflow])

  const query = useQuery({
    queryKey,
    queryFn: () => runly.commerce.getOrder(orderId, token),
    enabled: Boolean(token && orderId),
    staleTime: 0,
    refetchInterval: () => (flight.current ? false : 8000),
    retry: (n, e) => ![401, 403, 404].includes(e?.status) && n < 2,
  })
  const loaded = query.data?.data ?? null
  const order = loaded && loaded.companyId === companyId && loaded.outletId === outletId ? loaded : null
  const closed = Boolean(order && TERMINAL_ORDER_STATUSES.includes(order.status))
  const orderRef = useRef(order)
  useLayoutEffect(() => { orderRef.current = order }, [order])

  async function run(label, intent, resume = false) {
    if (flight.current) return flight.current
    if (!userId || !companyId || !outletId || !tableId) return null
    setPending(label)
    setFailure(null)
    flight.current = (async () => {
      try { return await (resume ? workflow.resume() : workflow.start(intent())) }
      catch (error) {
        if (scopeRef.current === journalKey) {
          setFailure({ ...classifyPosError(error), label })
          if (['conflict'].includes(classifyPosError(error).kind)) await query.refetch()
        }
        return null
      } finally {
        if (scopeRef.current === journalKey) setPending(null)
        flight.current = null
      }
    })()
    return flight.current
  }
  const start = (label, steps) => run(label, () => ({ order: orderRef.current, steps: steps(orderRef.current) }))

  const openStep = (guestCount) => ({
    action: 'createOrder',
    input: { outletId, tableId, experience: 'RESTAURANT', fulfillmentType: 'DINE_IN', guestCount },
  })

  return {
    order,
    closed,
    orderId,
    loading: Boolean(orderId) && query.isPending,
    pending,
    failure,
    setOrder,
    refetch: query.refetch,
    open: (guestCount) => start('Abriendo la mesa', () => [openStep(guestCount)]),
    // A plain repeat of an unsent line with no note or modifiers is a quantity
    // bump; anything customised is its own line.
    addItem: (item, { quantity = 1, note = null, modifiers = [], guestSeatId = null } = {}, label) => start(label ?? `Agregando ${item.name}`, (o) => {
      const plain = !note && modifiers.length === 0
      const line = plain && o?.lines?.find((l) => !l.voided && !l.dispatchedAt && !l.note && !(l.modifiers?.length) && l.productId === item.productId
        && (l.variantId ?? null) === (item.variantId ?? null) && (l.guestSeatId ?? null) === guestSeatId)
      if (line) return [{ action: 'updateLine', lineId: line.id, input: { quantity: String(Number(line.quantity) + quantity) } }]
      return [{
        action: 'addLine',
        input: {
          productId: item.productId,
          ...(item.variantId ? { variantId: item.variantId } : {}),
          quantity: String(quantity),
          ...(note ? { note } : {}),
          ...(modifiers.length ? { modifiers } : {}),
          ...(guestSeatId ? { guestSeatId } : {}),
        },
      }]
    }),
    updateLine: (line, input, label = 'Actualizando') => start(label, () => [{ action: 'updateLine', lineId: line.id, input }]),
    removeLine: (line) => start('Quitando producto', () => [{ action: 'deleteLine', lineId: line.id, input: {} }]),
    retry: () => run('Recuperando operación', null, true),
    dismissFailure: () => setFailure(null),
    reload: async () => { if (workflow.read()) await run('Recuperando operación', null, true); else setFailure(null); return query.refetch() },
  }
}
