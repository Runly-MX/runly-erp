// apps/desktop/src/modules/runly.pos/retail/hooks/useRetailOrder.js
import { useCallback, useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { runly } from '../../../../lib/runly.js'
import { classifyPosError, createAttemptTracker } from '../lib/retailErrors.js'
import { OPEN_STATUSES, orderKey } from '../lib/retailRules.js'

function readId(key) {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeId(key, id) {
  try { if (id) localStorage.setItem(key, id); else localStorage.removeItem(key) } catch { /* tab only */ }
}

// The sale lives on the server: one RETAIL order per terminal, every change
// is a versioned command with its own attempt key, and the cart shows the
// last OrderDTO as is. A lost response keeps the key so "Reintentar"
// replays the confirmed result instead of creating a second order or line.
export function useRetailOrder({ token, companyId, outletId, terminalId, sessionId }) {
  const queryClient = useQueryClient()
  const storageKey = orderKey(companyId, terminalId)
  const [orderId, setOrderId] = useState(() => readId(storageKey))
  const [pending, setPending] = useState(null)
  const [failure, setFailure] = useState(null)
  const trackers = useRef({})
  const lastAction = useRef(null)
  const tracker = (name) => (trackers.current[name] ??= createAttemptTracker(`pos-${name}`))

  useEffect(() => { setOrderId(readId(storageKey)) }, [storageKey])

  const query = useQuery({
    queryKey: ['pos-retail-order', orderId, token],
    queryFn: () => runly.commerce.getOrder(orderId, token),
    enabled: Boolean(token && orderId),
    staleTime: 5_000,
    retry: (count, error) => ![401, 403, 404].includes(error?.status) && count < 2,
  })
  const order = query.data?.data ?? null
  const usable = order && OPEN_STATUSES.includes(order.status) && order.terminalId === terminalId && order.sessionId === sessionId ? order : null
  // Retries run old closures: they must see the order created by the first
  // half of an interrupted attempt, never recreate it.
  const orderRef = useRef(usable)
  orderRef.current = usable ?? (orderRef.current?.terminalId === terminalId && orderRef.current?.sessionId === sessionId ? orderRef.current : null)

  // A stored order that no longer belongs to this open session (paid,
  // cancelled, other session, deleted) is simply forgotten.
  useEffect(() => {
    if (!orderId) return
    if (query.error?.status === 404 || (order && !usable)) {
      writeId(storageKey, null)
      setOrderId(null)
    }
  }, [orderId, order, usable, query.error, storageKey])

  const setOrder = useCallback((dto) => {
    orderRef.current = OPEN_STATUSES.includes(dto.status) ? dto : null
    queryClient.setQueryData(['pos-retail-order', dto.id, token], { data: dto })
    writeId(storageKey, dto.id)
    setOrderId(dto.id)
  }, [queryClient, token, storageKey])

  async function run(name, label, call) {
    setPending(label)
    setFailure(null)
    lastAction.current = { name, label, call }
    try {
      const result = await call()
      return result
    } catch (error) {
      const info = classifyPosError(error)
      if (!info.retrySameKey) Object.values(trackers.current).forEach((t) => t.reset())
      if (info.kind === 'conflict' && orderId) await query.refetch()
      setFailure({ ...info, label })
      return null
    } finally {
      setPending(null)
    }
  }

  async function ensureOrder() {
    if (orderRef.current) return orderRef.current
    const body = { outletId, terminalId, sessionId, experience: 'RETAIL', fulfillmentType: 'TAKEAWAY' }
    const created = (await runly.commerce.createOrder(body, token, { idempotencyKey: tracker('create').keyFor(body) })).data
    tracker('create').reset()
    setOrder(created)
    return created
  }

  async function command(name, makeCall) {
    const current = await ensureOrder()
    const { body, send } = makeCall(current)
    const dto = (await send(body, { idempotencyKey: tracker(name).keyFor({ id: current.id, ...body }) })).data
    tracker(name).reset()
    setOrder(dto)
    return dto
  }

  const addItem = (item, label) => run('add', label ?? `Agregando ${item.name}`, async () => {
    // Same product/variant already in the sale: one more unit on that line.
    const current = orderRef.current
    const existing = current?.lines?.find((l) => !l.voided && l.productId === item.productId && (l.variantId ?? null) === (item.variantId ?? null))
    if (existing) {
      return command('update', (o) => ({
        body: { expectedVersion: o.version, quantity: String(Number(existing.quantity) + 1) },
        send: (b, opt) => runly.commerce.updateLine(o.id, existing.id, b, token, opt),
      }))
    }
    return command('add', (o) => ({
      body: { expectedVersion: o.version, productId: item.productId, ...(item.variantId ? { variantId: item.variantId } : {}), quantity: '1' },
      send: (b, opt) => runly.commerce.addLine(o.id, b, token, opt),
    }))
  })

  const setQuantity = (line, quantity) => run('update', 'Actualizando cantidad', () => command('update', (o) => ({
    body: { expectedVersion: o.version, quantity: String(quantity) },
    send: (b, opt) => runly.commerce.updateLine(o.id, line.id, b, token, opt),
  })))

  const removeLine = (line) => run('delete', `Quitando ${line.productName}`, () => command('delete', (o) => ({
    body: { expectedVersion: o.version },
    send: (b, opt) => runly.commerce.deleteLine(o.id, line.id, b, token, opt),
  })))

  const discountLine = (line, amount, reason) => run('discount', 'Aplicando descuento', () => command('discount', (o) => ({
    body: { expectedVersion: o.version, amount, reason },
    send: (b, opt) => runly.commerce.discount(o.id, line.id, b, token, opt),
  })))

  // Emptying removes the lines one by one; the empty order stays on the
  // server and is reused by the next sale (no cancel permission needed).
  const clear = () => run('clear', 'Vaciando la venta', async () => {
    let current = orderRef.current
    for (const line of (current?.lines ?? []).filter((l) => !l.voided)) {
      current = await command('delete', (o) => ({ body: { expectedVersion: o.version }, send: (b, opt) => runly.commerce.deleteLine(o.id, line.id, b, token, opt) }))
    }
    return current
  })

  return {
    order: usable,
    loading: Boolean(orderId) && query.isPending,
    pending,
    failure,
    retry: () => lastAction.current && run(lastAction.current.name, lastAction.current.label, lastAction.current.call),
    dismissFailure: () => setFailure(null),
    reload: () => { Object.values(trackers.current).forEach((t) => t.reset()); setFailure(null); return query.refetch() },
    addItem,
    setQuantity,
    removeLine,
    discountLine,
    clear,
    setOrder,
    finish: () => { orderRef.current = null; writeId(storageKey, null); setOrderId(null) },
  }
}
