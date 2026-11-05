// apps/desktop/src/modules/runly.pos/retail/RetailCajaScreen.jsx
import { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle, Button, EmptyState, ErrorState, PeekSheet, SegmentedControl, Skeleton } from '@runly/ui'
import { Lock, Settings2, Utensils, WifiOff } from 'lucide-react'
import RestaurantAccounts from '../restaurant/components/RestaurantAccounts.jsx'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { runly } from '../../../lib/runly.js'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import CartPanel from './components/CartPanel.jsx'
import ChargeDialog from './components/ChargeDialog.jsx'
import PosContextGate from './components/PosContextGate.jsx'
import PosOperationBar, { useOnline } from './components/PosOperationBar.jsx'
import ReceiptDialog from './components/ReceiptDialog.jsx'
import SaleCompletePanel from './components/SaleCompletePanel.jsx'
import SellablePanel from './components/SellablePanel.jsx'
import SessionOpenPanel from './components/SessionOpenPanel.jsx'
import { CashMovementDialog, SessionCloseDialog } from './components/SessionDialogs.jsx'
import { useRetailContext } from './hooks/useRetailContext.js'
import { useRetailOrder } from './hooks/useRetailOrder.js'
import {usePendingOperations} from './hooks/usePendingOperations.js'
import {readPending,writePending} from './lib/pendingCommands.js'
import { classifyPosError } from './lib/retailErrors.js'
import { activeLines, formatMoney, itemCount, quantitiesByProduct } from './lib/retailRules.js'

// Side cart from 1024 px (landscape tablet, terminal, desktop); below that
// the cart is a bottom PeekSheet. Only one of them is mounted.
function useWideLayout() {
  const query = '(min-width: 1024px)'
  const [wide, setWide] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches)
  useEffect(() => {
    const mq = window.matchMedia(query)
    const onChange = (e) => setWide(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return wide
}

// POS Tienda: a modern register. Choose outlet + register once, open the
// register, scan or tap, charge, hand the receipt, next customer. Retail
// only: no tables, seats, kitchen or floor plans.
function RetailCajaView() {
  const { session: auth, userProfile } = useAuth()
  const token = auth?.access_token
  const { activeCompanyId } = useActiveCompany()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const online = useOnline()
  const wide = useWideLayout()
  const ctx = useRetailContext({ token, companyId: activeCompanyId, userId: userProfile?.id })
  const context = ctx.context
  const outlet = context?.outlets?.find((o) => o.id === context?.selectedOutletId)
  const terminal = context?.terminals?.find((t) => t.id === context?.selectedTerminalId)
  const session = context?.currentSession ?? null
  const sale = useRetailOrder({ token, userId:userProfile?.id, companyId: activeCompanyId, outletId: outlet?.id, terminalId: terminal?.id, sessionId: session?.id })
  const unresolved=usePendingOperations({userId:userProfile?.id,companyId:activeCompanyId,sessionId:session?.id,terminalId:terminal?.id})
  const [params, setParams] = useSearchParams()
  const [dialog, setDialog] = useState(null)
  const [completed, setCompleted] = useState(null)
  const [cartOpen, setCartOpen] = useState(false)
  const [recovering,setRecovering]=useState(false)
  const methods = context?.paymentMethods ?? []
  const caps = context?.capabilities ?? {}
  const currency = context?.currency ?? 'MXN'
  const saleInProgress = Boolean(sale.pending||unresolved.length||(sale.order && (sale.order.lines ?? []).some((l) => !l.voided)))
  const canAdmin = Boolean(userProfile?.isAdmin || userProfile?.permissions?.includes('pos.admin.read'))
  // Mostrador (retail register) and Mesas (restaurant accounts) share the same
  // register, session and ledger; a restaurant-only outlet only has Mesas.
  const mixed = Boolean(caps.retail && caps.restaurant)
  const tablesView = Boolean(caps.restaurant) && (!caps.retail || params.get('vista') === 'mesas')
  const setView = (value) => setParams((prev) => { const next = new URLSearchParams(prev); if (value === 'mesas') next.set('vista', 'mesas'); else { next.delete('vista'); next.delete('cuenta') } return next }, { replace: true })

  // After a lost payment response the dialog may be closed: ask the server
  // for the real state; a PAID order shows its confirmed payment and change.
  async function settleAfterCharge() {
    const id = sale.order?.id
    setDialog(null)
    if (!id) return
    try {
      const order = (await runly.commerce.getOrder(id, token)).data
      if (order.status === 'PAID') {
        const payment = [...(order.payments ?? [])].filter((p) => p.status === 'CAPTURED').pop()
        sale.finish()
        setCompleted({ order, payment, receiptId: order.receiptId })
        setCartOpen(true)
        refreshContext()
        return
      }
      sale.setOrder(order)
    } catch {
      sale.reload()
    }
  }

  function refreshContext() {
    queryClient.invalidateQueries({ queryKey: ['pos-retail-context', activeCompanyId] })
  }

  async function recover(record){
    if(recovering)return
    setRecovering(true)
    const opt={idempotencyKey:record.key},b=record.body
    try{
      const calls={
        'pos-open':()=>runly.commerce.openSession(b,token,opt),
        'pos-close':()=>runly.commerce.closeSession(record.scope,b,token,opt),
        'pos-cash':()=>runly.commerce.cashMovement(record.sessionId,b,token,opt),
        'pos-pay':()=>runly.commerce.addPayment(record.scope,b,token,opt),
        'pos-refund':()=>runly.commerce.refund(record.scope,b,token,opt),
      }
      if(!calls[record.prefix])return
      const result=(await calls[record.prefix]()).data
      if(readPending(record.storageKey)?.key===record.key)writePending(record.storageKey,null)
      if(record.prefix==='pos-pay'&&result.order.status==='PAID'&&(!sale.order||sale.order.id===record.scope)){
        sale.finish();setCompleted(result);setCartOpen(true)
      }
      refreshContext()
      queryClient.invalidateQueries({queryKey:['pos-retail-order',activeCompanyId]})
      toast.success('Operación recuperada sin repetirla')
    }catch(error){
      if(error.status>=400&&error.status<500&&![401,403,408].includes(error.status)&&error.code!=='company_changed'&&readPending(record.storageKey)?.key===record.key)writePending(record.storageKey,null)
      toast.error(classifyPosError(error).message)
    }finally{setRecovering(false)}
  }

  let body
  if (ctx.isPending && !context) {
    body = <div className="space-y-3 p-6" aria-label="Cargando caja"><Skeleton className="h-14" /><Skeleton className="h-96" /></div>
  } else if (ctx.error) {
    const info = classifyPosError(ctx.error)
    body = info.kind === 'forbidden'
      ? <EmptyState icon={Lock} title="No tienes acceso a la caja" description="Pide a un administrador el permiso para operar la caja de punto de venta." />
      : <ErrorState title="No se pudo cargar la caja" description={info.message} onRetry={ctx.refetch} />
  } else if (!context || ['SELECT_OUTLET', 'SELECT_TERMINAL'].includes(context.operationState)) {
    body = (
      <div className="overflow-y-auto p-4 sm:p-6">
        <PosContextGate
          key={ctx.selection.outletId ?? 'outlet'}
          context={context}
          selection={{ outletId: context?.selectedOutletId ?? null, terminalId: null }}
          notice={ctx.notice}
          onOutlet={(id) => ctx.chooseOutlet(id)}
          onTerminal={(id) => ctx.chooseTerminal(id)}
          canConfigure={canAdmin}
        />
      </div>
    )
  } else if (!caps.retail && !caps.restaurant) {
    body = (
      <div className="p-6">
        <EmptyState
          icon={Utensils}
          title={`${outlet?.name ?? 'Esta sucursal'} no tiene una modalidad de venta`}
          description="Un administrador debe definir si la sucursal es de tienda, restaurante o mixta."
          action={{ label: 'Cambiar de caja', onClick: ctx.changeCaja }}
        />
      </div>
    )
  } else if (context.operationState === 'CONFIGURATION_REQUIRED' || context.operationState === 'RECONCILIATION_REQUIRED') {
    body = (
      <div className="p-6">
        <EmptyState
          icon={Settings2}
          title={context.operationState === 'CONFIGURATION_REQUIRED' ? 'Falta configurar el punto de venta' : 'La caja necesita conciliación'}
          description={context.operationState === 'CONFIGURATION_REQUIRED' ? 'Un administrador debe definir la moneda e impuestos del punto de venta.' : 'La sesión abierta usa otra moneda que la configuración actual. Un encargado debe cerrarla y conciliarla.'}
          action={canAdmin ? { label: 'Ir a Administración', onClick: () => navigate('/app/m/runly.pos/pos/admin') } : undefined}
        />
      </div>
    )
  } else if (!session) {
    body = (
      <div className="overflow-y-auto p-4 sm:p-6">
        <SessionOpenPanel
          token={token}
          outletId={outlet.id}
          terminalId={terminal.id}
          currency={currency}
          cajaName={terminal.name}
          canOpen={caps.openSession && !unresolved.length}
          onOpened={() => { toast.success('Caja abierta'); refreshContext() }}
        />
      </div>
    )
  } else if (tablesView) {
    body = (
      <RestaurantAccounts
        token={token} companyId={activeCompanyId} outlet={outlet} session={session} methods={methods} currency={currency}
        canCharge={Boolean(caps.charge)} initialOrderId={params.get('cuenta')} onSettled={refreshContext} online={online} userId={userProfile?.id}
      />
    )
  } else {
    const cartContent = completed ? (
      <SaleCompletePanel
        result={completed}
        methods={methods}
        onReceipt={() => setDialog({ kind: 'receipt', receiptId: completed.receiptId })}
        onNext={() => { setCompleted(null); setCartOpen(false) }}
      />
    ) : (
      <CartPanel sale={sale} currency={currency} canDiscount={caps.discount} onCharge={() => setDialog({ kind: 'charge' })} />
    )
    body = (
      <div className="flex min-h-0 flex-1">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col p-3 sm:p-4">
          {!online && (
            <Alert variant="destructive" className="mb-3">
              <WifiOff className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Sin conexión</AlertTitle>
              <AlertDescription>No se pueden agregar productos ni cobrar hasta que vuelva la conexión. No hay ventas sin conexión.</AlertDescription>
            </Alert>
          )}
          <SellablePanel
            token={token}
            outletId={outlet.id}
            currency={currency}
            inCart={completed ? {} : quantitiesByProduct(sale.order)}
            disabled={!online || Boolean(sale.pending) || Boolean(completed) || sale.loading || !caps.charge || Boolean(unresolved.length)}
            onAdd={(item) => sale.addItem(item)}
          />
        </div>
        {wide ? (
        <aside className="flex w-[380px] shrink-0 flex-col border-l border-[hsl(var(--border))] bg-[hsl(var(--card))] xl:w-[420px]" aria-label="Venta actual">
          {cartContent}
        </aside>
        ) : (
        <PeekSheet
          modal
          expanded={cartOpen}
          onExpandedChange={setCartOpen}
          label="Venta actual"
          peekHeight={64}
          maxHeight="85dvh"
          action={!cartOpen && !completed && sale.order && activeLines(sale.order).length > 0 && !sale.pending && !sale.failure && Number(sale.order.remainingAmount) > 0 ? (
            <Button size="lg" className="h-12 min-w-28 text-base font-bold sm:h-12" onClick={() => setDialog({ kind: 'charge' })}>Cobrar</Button>
          ) : null}
          handle={(
            <span className="flex w-full items-center justify-between gap-3 text-sm font-semibold text-[hsl(var(--foreground))]">
              <span>{completed ? 'Venta cobrada' : `${itemCount(sale.order)} artículo(s)`}</span>
              <span className="text-lg font-extrabold tabular-nums">{completed ? formatMoney(completed.order.totalAmount, completed.order.currency) : formatMoney(sale.order?.remainingAmount ?? 0, sale.order?.currency ?? currency)}</span>
            </span>
          )}
          bodyClassName="p-0"
        >
          <div className="h-[70dvh]">{cartContent}</div>
        </PeekSheet>
        )}
      </div>
    )
  }

  const ready = Boolean(outlet && terminal)
  return (
    <div className="flex h-full min-h-0 flex-col bg-[hsl(var(--background))]">
      {ready && (
        <PosOperationBar
          outletName={outlet.name}
          terminalName={terminal.name}
          session={session}
          cashier={userProfile?.displayName ?? userProfile?.firstName ?? null}
          online={online}
          capabilities={caps}
          saleInProgress={saleInProgress}
          onOrders={() => navigate('/app/m/runly.pos/pos/orders')}
          onCashIn={() => setDialog({ kind: 'cash', type: 'IN' })}
          onCashOut={() => setDialog({ kind: 'cash', type: 'OUT' })}
          onClose={() => setDialog({ kind: 'close' })}
          onChangeCaja={() => { setCompleted(null); ctx.changeCaja() }}
        />
      )}
      {ready && mixed && (
        <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-3 py-2 sm:px-4">
          <SegmentedControl size="lg" ariaLabel="Mostrador o mesas" className="w-full sm:w-72" value={tablesView ? 'mesas' : 'mostrador'} onChange={(v) => setView(v === 'mesas' ? 'mesas' : 'mostrador')}
            options={[{ value: 'mostrador', label: 'Mostrador' }, { value: 'mesas', label: 'Mesas' }]} />
        </div>
      )}
      {unresolved.some((r)=>r.prefix!=='order'||!session)&&!dialog&&(
        <Alert className="m-3"><AlertTitle>Operación pendiente de confirmar</AlertTitle><AlertDescription>Recupera su resultado antes de cerrar o cambiar de caja.</AlertDescription>
          {unresolved.filter((r)=>r.prefix!=='order'||!session).map((r)=><Button key={r.storageKey} variant="outline" loading={recovering||Boolean(sale.pending)} onClick={()=>r.prefix==='order'?sale.retry():recover(r)}>Recuperar operación pendiente</Button>)}
        </Alert>
      )}
      {body}

      {dialog?.kind === 'charge' && sale.order && (
        <ChargeDialog
          order={sale.order}
          sessionId={session.id}
          token={token}
          methods={methods}
          onPaid={(result) => { setDialog(null); sale.finish(); setCompleted(result); setCartOpen(true); refreshContext() }}
          onPartial={(order) => sale.setOrder(order)}
          onConflict={() => sale.reload()}
          onClose={settleAfterCharge}
        />
      )}
      {dialog?.kind === 'receipt' && <ReceiptDialog receiptId={dialog.receiptId} token={token} onClose={() => setDialog(null)} />}
      {dialog?.kind === 'cash' && (
        <CashMovementDialog kind={dialog.type} session={session} token={token} currency={currency} onClose={() => setDialog(null)}
          onDone={(k) => { setDialog(null); toast.success(k === 'IN' ? 'Entrada registrada' : 'Salida registrada') }} />
      )}
      {dialog?.kind === 'close' && (
        <SessionCloseDialog session={session} token={token} currency={currency} onClose={() => setDialog(null)}
          onClosed={() => { setDialog(null); setCompleted(null); refreshContext() }} />
      )}
    </div>
  )
}

export default function RetailCajaScreen(){
  const {activeCompanyId}=useActiveCompany()
  const {userProfile}=useAuth()
  return <RetailCajaView key={`${userProfile?.id}:${activeCompanyId}`} />
}
