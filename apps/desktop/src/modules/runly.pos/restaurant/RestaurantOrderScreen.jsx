import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle, Button, EmptyState, ErrorState, NumberStepper, PeekSheet, Skeleton, StatusPill } from '@runly/ui'
import { ArrowLeft, Banknote, CircleCheck, Loader2, Lock, Receipt, Send, Users } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'
import CommandFailureAlert from '../../runly.catalog/components/CommandFailureAlert.jsx'
import SellablePanel from '../retail/components/SellablePanel.jsx'
import { usePosCommand } from '../retail/hooks/usePosCommand.js'
import { classifyPosError } from '../retail/lib/retailErrors.js'
import { formatMoney } from '../retail/lib/retailRules.js'
import ComandaPanel from './components/ComandaPanel.jsx'
import ItemOptionsDialog from './components/ItemOptionsDialog.jsx'
import { DispatchDialog, VoidDialog } from './components/OrderDialogs.jsx'
import RestaurantShell from './components/RestaurantShell.jsx'
import { useTableOrder } from './hooks/useTableOrder.js'
import { useWideLayout } from './hooks/useWideLayout.js'
import { activeLines, splitStages } from './lib/restaurantRules.js'

const TABLES_PATH = '/app/m/runly.pos/pos/comandero'
const CAJA_PATH = '/app/m/runly.pos/pos/caja'

function OpenTablePanel({ table, canOpen, sale, onBack }) {
  const [guests, setGuests] = useState(table.capacity ? Math.min(2, table.capacity) : 2)
  const blocked = table.reconciliationRequired ? 'Esta mesa tiene más de una cuenta abierta y requiere conciliación de un encargado.'
    : table.status === 'DIRTY' ? 'La mesa está por limpiar. Un encargado debe marcarla como limpia.'
      : table.status === 'RESERVED' ? 'La mesa está reservada.' : table.status === 'DISABLED' ? 'La mesa está deshabilitada.' : null
  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 p-6">
      <div className="space-y-1 text-center">
        <p className="text-sm font-semibold text-[hsl(var(--muted-foreground))]">Mesa libre</p>
        <h2 className="text-3xl font-extrabold text-[hsl(var(--foreground))]">{table.name}</h2>
      </div>
      {blocked && <Alert variant="warning"><AlertDescription>{blocked}</AlertDescription></Alert>}
      <CommandFailureAlert failure={sale.failure} onRetry={sale.retry} retrying={Boolean(sale.pending)} />
      {!blocked && (
        <>
          <div className="flex items-center justify-between gap-4 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
            <span className="flex items-center gap-2 text-base font-semibold"><Users className="h-5 w-5" aria-hidden="true" />Comensales</span>
            <NumberStepper label="Número de comensales" value={guests} onChange={setGuests} min={1} max={99} disabled={Boolean(sale.pending)} />
          </div>
          <Button size="lg" className="h-14 w-full text-lg font-bold" disabled={!canOpen || Boolean(sale.pending) || sale.failure?.kind === 'lost'} onClick={() => sale.open(guests)}>
            {sale.pending ? <><Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />Abriendo mesa</> : 'Abrir mesa'}
          </Button>
          {!canOpen && <p className="text-center text-sm text-[hsl(var(--muted-foreground))]">Tu puesto no incluye abrir cuentas.</p>}
        </>
      )}
      <Button variant="outline" size="lg" className="h-12" onClick={onBack}><ArrowLeft className="h-4 w-4" aria-hidden="true" />Volver a las mesas</Button>
    </div>
  )
}

function OrderView({ outlet, token, caps, currency, companyId, userProfile, online }) {
  // Module routes are one wildcard: pos/comandero/mesa/<tableId>.
  const { '*': wildcard } = useParams()
  const tableId = (wildcard ?? '').split('/')[3] ?? null
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const wide = useWideLayout()
  const [options, setOptions] = useState(null)
  const [dispatchLines, setDispatchLines] = useState(null)
  const [voidLine, setVoidLine] = useState(null)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [loadingItem, setLoadingItem] = useState(false)

  const tablesQuery = useQuery({
    queryKey: ['pos-restaurant-tables', companyId, outlet.id, false, token],
    queryFn: () => runly.commerce.tables({ outletId: outlet.id }, token),
    enabled: Boolean(token),
    refetchInterval: 8000,
    retry: (n, e) => ![401, 403, 404].includes(e?.status) && n < 2,
  })
  const table = (tablesQuery.data?.data ?? []).find((t) => t.id === tableId) ?? null
  const sale = useTableOrder({ token, userId: userProfile?.id, companyId, outletId: outlet.id, table })
  const order = sale.order
  const refreshAll = () => { sale.refetch(); queryClient.invalidateQueries({ queryKey: ['pos-restaurant-tables', companyId] }) }

  const dispatch = usePosCommand({
    prefix: 'kitchen-dispatch', scope: order?.id,
    run: (body, o) => runly.commerce.dispatchKitchen(order.id, body, token, o),
    onSuccess: (res) => {
      const result = res.data
      sale.setOrder(result.order)
      setDispatchLines(null)
      toast.success(result.manual ? 'Registrado. La sucursal usa preparación manual: avisa a cocina.' : result.dispatchSequence > 1 ? `Extras enviados a cocina (envío ${result.dispatchSequence})` : 'Comanda enviada a cocina')
    },
    onError: (info) => { if (info.kind === 'conflict') refreshAll() },
  })
  const bill = usePosCommand({
    prefix: 'request-bill', scope: order?.id,
    run: (body, o) => runly.commerce.requestBill(order.id, body, token, o),
    onSuccess: () => { toast.success('Cuenta solicitada'); refreshAll() },
    onError: (info) => { if (info.kind === 'conflict') refreshAll() },
  })
  const guestsCmd = usePosCommand({
    prefix: 'order-guests', scope: order?.id,
    run: (body, o) => runly.commerce.updateRestaurantOrder(order.id, body, token, o),
    onSuccess: refreshAll,
    onError: (info) => { if (info.kind === 'conflict') refreshAll() },
  })
  const voidCmd = usePosCommand({
    prefix: 'void-prep', scope: order && voidLine ? `${order.id}:${voidLine.id}` : null,
    run: (body, o) => runly.commerce.voidPreparation(order.id, voidLine.id, body, token, o),
    onSuccess: () => { toast.success('Producto anulado'); setVoidLine(null); refreshAll() },
    onError: (info) => { if (info.kind === 'conflict') refreshAll() },
  })

  const busy = Boolean(sale.pending) || !online || dispatch.isPending
  const canEdit = caps.takeOrders && !sale.closed
  const canVoid = Boolean(userProfile?.isAdmin || userProfile?.permissions?.includes('pos.orders.cancel')) && !(Number(order?.paidAmount) > 0)

  async function pick(item) {
    if (!canEdit || busy || loadingItem) return
    setLoadingItem(true)
    try {
      const groups = (await queryClient.fetchQuery({ queryKey: ['pos-restaurant-modifiers', companyId, item.productId, token], queryFn: () => runly.commerce.modifiers(item.productId, token), staleTime: 60_000 })).data ?? []
      if (groups.some((g) => (g.options ?? []).length > 0)) setOptions({ item, groups })
      else sale.addItem(item)
    } catch (error) {
      toast.error(classifyPosError(error).message)
    } finally { setLoadingItem(false) }
  }

  if (tablesQuery.isPending) return <div className="space-y-3 p-6" aria-label="Cargando mesa"><Skeleton className="h-14" /><Skeleton className="h-96" /></div>
  if (tablesQuery.isError) return <ErrorState title="No se pudo cargar la mesa" description={classifyPosError(tablesQuery.error).message} onRetry={tablesQuery.refetch} />
  if (!table) return <div className="p-6"><EmptyState icon={Lock} title="Esta mesa ya no existe" description="Pudo haberse deshabilitado o eliminado." action={{ label: 'Volver a las mesas', onClick: () => navigate(TABLES_PATH) }} /></div>
  if (!order && !sale.loading && !table.activeOrderId) {
    return <OpenTablePanel table={table} canOpen={caps.takeOrders && online} sale={sale} onBack={() => navigate(TABLES_PATH)} />
  }
  if (!order) {
    return sale.loading || sale.pending
      ? <div className="space-y-3 p-6" aria-label="Cargando cuenta"><Skeleton className="h-14" /><Skeleton className="h-96" /></div>
      : <ErrorState title="No se pudo cargar la cuenta" description="Revisa tu conexión e inténtalo de nuevo." onRetry={sale.reload} />
  }
  if (sale.closed) {
    return (
      <div className="p-6">
        <EmptyState icon={CircleCheck} title={order.status === 'PAID' ? 'La cuenta ya está cobrada' : 'La cuenta está cerrada'} description="La mesa se libera cuando el cobro queda confirmado."
          action={{ label: 'Volver a las mesas', onClick: () => navigate(TABLES_PATH) }} />
      </div>
    )
  }

  const { draft } = splitStages(order)
  const guestsById = new Map((order.guests ?? []).map((g) => [g.id, g.label]))
  const nextSequence = (order.dispatches?.length ?? 0) + 1
  const lostSend = dispatch.failure?.kind === 'lost'
  const sentCount = activeLines(order).length - draft.length
  const panel = (
    <ComandaPanel
      order={order} currency={currency} busy={busy} guestsById={guestsById} canVoid={canVoid && online}
      onQuantity={(line, q) => sale.updateLine(line, { quantity: String(q) }, 'Actualizando cantidad')}
      onNote={(line, note) => sale.updateLine(line, { note }, 'Guardando nota')}
      onRemove={(line) => sale.removeLine(line)}
      onVoid={(line) => setVoidLine(line)}
      footer={(
        <>
          <CommandFailureAlert failure={sale.failure} onRetry={sale.retry} retrying={Boolean(sale.pending)} />
          <CommandFailureAlert failure={dispatch.failure} onRetry={dispatch.retry} retrying={dispatch.isPending} />
          <CommandFailureAlert failure={bill.failure} onRetry={bill.retry} retrying={bill.isPending} />
          {sale.pending && <p role="status" className="flex items-center gap-2 text-sm text-[hsl(var(--muted-foreground))]"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{sale.pending}…</p>}
          <Button size="lg" className="h-14 w-full text-lg font-bold" disabled={!canEdit || !online || dispatch.isPending || Boolean(sale.pending) || (!lostSend && draft.length === 0)}
            onClick={() => (lostSend ? dispatch.retry() : setDispatchLines(draft))}>
            <Send className="h-5 w-5" aria-hidden="true" />
            {lostSend ? 'Reintentar envío a cocina' : draft.length ? `Enviar a cocina (${draft.length})` : sentCount ? 'Todo enviado a cocina' : 'Enviar a cocina'}
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="outline" size="lg" className="h-12" disabled={!canEdit || !online || bill.isPending || sentCount === 0 || table.status === 'BILL_REQUESTED'}
              onClick={() => bill.mutate({ expectedVersion: order.version })}>
              <Receipt className="h-4 w-4" aria-hidden="true" />{table.status === 'BILL_REQUESTED' ? 'Cuenta pedida' : 'Pedir cuenta'}
            </Button>
            {caps.charge
              ? <Button variant="outline" size="lg" className="h-12" onClick={() => navigate(`${CAJA_PATH}?vista=mesas&cuenta=${order.id}`)}><Banknote className="h-4 w-4" aria-hidden="true" />Cobrar</Button>
              : <span className="flex items-center justify-center text-center text-xs text-[hsl(var(--muted-foreground))]">El cobro lo hace Caja</span>}
          </div>
        </>
      )}
    />
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 sm:px-4">
        <Button variant="outline" size="icon" className="h-11 w-11 sm:h-11 sm:w-11" aria-label="Volver a las mesas" onClick={() => navigate(TABLES_PATH)}><ArrowLeft className="h-5 w-5" aria-hidden="true" /></Button>
        <div className="min-w-0">
          <p className="truncate text-lg font-extrabold text-[hsl(var(--foreground))]">{table.name} · Cuenta #{order.orderNumber}</p>
          <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">Mesero: {order.waiterName ?? '—'}</p>
        </div>
        <StatusPill tone={table.status === 'BILL_REQUESTED' ? 'brand' : 'neutral'}>{table.status === 'BILL_REQUESTED' ? 'Cuenta solicitada' : draft.length ? 'Tomando pedido' : sentCount ? 'En servicio' : 'Abierta'}</StatusPill>
        <span className="flex-1" />
        <span className="flex items-center gap-2 text-sm font-semibold"><Users className="h-4 w-4" aria-hidden="true" />Comensales</span>
        <NumberStepper label="Número de comensales" value={order.guestCount ?? order.guests?.length ?? 1} min={Math.max(1, order.guests?.length ?? 1)} max={99} disabled={!canEdit || !online || guestsCmd.isPending}
          onChange={(n) => guestsCmd.mutate({ expectedVersion: order.version, guestCount: n })} />
      </div>
      <CommandFailureAlert failure={guestsCmd.failure} onRetry={guestsCmd.retry} retrying={guestsCmd.isPending} className="m-3" />
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-3 sm:p-4">
          {!caps.takeOrders && <Alert className="mb-3"><AlertTitle>Solo consulta</AlertTitle><AlertDescription>Tu puesto puede ver la cuenta pero no agregar productos.</AlertDescription></Alert>}
          <SellablePanel token={token} outletId={outlet.id} currency={currency} disabled={!canEdit || busy || loadingItem || lostSend} onAdd={pick} />
        </div>
        {wide ? (
          <aside className="flex w-[400px] shrink-0 flex-col border-l border-[hsl(var(--border))] bg-[hsl(var(--card))] xl:w-[440px]" aria-label="Comanda">{panel}</aside>
        ) : (
          <PeekSheet modal expanded={sheetOpen} onExpandedChange={setSheetOpen} label="Comanda" peekHeight={64} maxHeight="88dvh" bodyClassName="p-0"
            action={!sheetOpen && canEdit && online && !dispatch.isPending && !sale.pending && (draft.length > 0 || lostSend) ? (
              <Button size="lg" className="h-12 min-w-24 text-base font-bold sm:h-12" onClick={() => (lostSend ? dispatch.retry() : setDispatchLines(draft))}><Send className="h-4 w-4" aria-hidden="true" />{lostSend ? 'Reintentar' : 'Enviar'}</Button>
            ) : null}
            handle={(
              <span className="flex w-full items-center justify-between gap-3 text-sm font-semibold text-[hsl(var(--foreground))]">
                <span>{draft.length ? `${draft.length} sin enviar` : `${sentCount} en la cuenta`}</span>
                <span className="text-lg font-extrabold tabular-nums">{formatMoney(order.totalAmount, currency)}</span>
              </span>
            )}>
            <div className="flex h-[74dvh] flex-col">{panel}</div>
          </PeekSheet>
        )}
      </div>
      {options && (
        <ItemOptionsDialog item={options.item} groups={options.groups} guests={order.guests ?? []} activeSeatId={null} currency={currency}
          onClose={() => setOptions(null)}
          onSubmit={(extra) => { const { item } = options; setOptions(null); sale.addItem(item, extra) }} />
      )}
      {dispatchLines && <DispatchDialog lines={dispatchLines} nextSequence={nextSequence} expectedVersion={order.version} command={dispatch} onClose={() => setDispatchLines(null)} />}
      {voidLine && <VoidDialog line={voidLine} command={voidCmd} onClose={() => setVoidLine(null)} onConfirm={(reason) => voidCmd.mutate({ expectedVersion: order.version, reason })} />}
    </div>
  )
}

// Comandero: take the order of one table. Anything that changes the account
// goes through a journaled server command; the kitchen sequence lives on the
// server, not in this component.
export default function RestaurantOrderScreen() {
  return (
    <RestaurantShell title="Comandero" nav={[{ to: TABLES_PATH, label: 'Mesas' }]}>
      {(props) => <OrderView {...props} />}
    </RestaurantShell>
  )
}
