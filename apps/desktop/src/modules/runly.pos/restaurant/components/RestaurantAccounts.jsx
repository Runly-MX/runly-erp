import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { EmptyState, ErrorState, Skeleton, StatusPill, cn } from '@runly/ui'
import { Clock, Receipt, Users } from 'lucide-react'
import { runly } from '../../../../lib/runly.js'
import { classifyPosError } from '../../retail/lib/retailErrors.js'
import { formatMoney } from '../../retail/lib/retailRules.js'
import { elapsedLabel } from '../lib/restaurantRules.js'
import AccountCheckout from './AccountCheckout.jsx'

// Restaurant Caja: pending accounts of the outlet on the left, the selected
// account's checkout on the right (a single column on narrow screens).
export default function RestaurantAccounts({ token, companyId, outlet, session, methods, currency, canCharge, initialOrderId, onSettled }) {
  const [selected, setSelected] = useState(initialOrderId ?? null)
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 30_000); return () => clearInterval(t) }, [])

  const list = useQuery({
    queryKey: ['pos-restaurant-accounts', companyId, outlet.id, token],
    queryFn: () => runly.commerce.listOrders({ outletId: outlet.id, experience: 'RESTAURANT', pendingPayment: true, pageSize: 100 }, token),
    refetchInterval: 8000,
    retry: (n, e) => ![401, 403, 404].includes(e?.status) && n < 2,
  })
  const accounts = list.data?.data ?? []

  const listPane = (
    <div className={cn('min-h-0 flex-col border-[hsl(var(--border))] lg:flex lg:w-[360px] lg:shrink-0 lg:border-r', selected ? 'hidden' : 'flex flex-1')}>
      <h2 className="border-b border-[hsl(var(--border))] px-4 py-3 text-sm font-bold uppercase tracking-wide text-[hsl(var(--foreground))]">Cuentas por cobrar · {accounts.length}</h2>
      <div className="min-h-0 flex-1 overflow-y-auto p-3" aria-busy={list.isFetching}>
        {list.isPending ? (
          <div className="space-y-2" aria-label="Cargando cuentas"><Skeleton className="h-20" /><Skeleton className="h-20" /></div>
        ) : list.isError ? (
          <ErrorState title="No se pudieron cargar las cuentas" description={classifyPosError(list.error).message} onRetry={list.refetch} />
        ) : accounts.length === 0 ? (
          <EmptyState icon={Receipt} title="No hay cuentas por cobrar" description="Las cuentas con consumo aparecen aquí en cuanto el mesero las abre." />
        ) : (
          <ul className="space-y-2" aria-label="Cuentas por cobrar">
            {accounts.map((o) => (
              <li key={o.id}>
                <button type="button" onClick={() => setSelected(o.id)} aria-current={selected === o.id}
                  className={cn('flex min-h-20 w-full flex-col gap-1 rounded-xl border p-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
                    selected === o.id ? 'border-2 border-(--brand-primary) bg-(--brand-soft)' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted))]')}>
                  <span className="flex items-baseline justify-between gap-2">
                    <span className="truncate text-lg font-bold">{o.orderLabel}</span>
                    <span className="text-lg font-extrabold tabular-nums">{formatMoney(o.remainingAmount, currency)}</span>
                  </span>
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-[hsl(var(--muted-foreground))]">
                    <span>Cuenta #{o.orderNumber}</span>
                    {o.waiterName && <span>{o.waiterName}</span>}
                    <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden="true" />{o.guestCount}</span>
                    <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" aria-hidden="true" />{elapsedLabel(o.openedAt, now)}</span>
                    {Number(o.paidAmount) > 0 && <StatusPill tone="warning" size="sm">Pago parcial</StatusPill>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )

  return (
    <div className="flex min-h-0 flex-1">
      {listPane}
      <section className={cn('min-h-0 min-w-0 flex-1 flex-col', selected ? 'flex' : 'hidden lg:flex')} aria-label="Cobro de la cuenta">
        {selected
          ? <AccountCheckout key={selected} orderId={selected} token={token} companyId={companyId} session={session} methods={methods} currency={currency} canCharge={canCharge}
              onSettled={onSettled} onBack={() => setSelected(null)} />
          : <div className="flex flex-1 items-center justify-center p-6"><EmptyState icon={Receipt} title="Elige una cuenta" description="Toca una cuenta de la lista para ver su consumo y cobrarla." /></div>}
      </section>
    </div>
  )
}
