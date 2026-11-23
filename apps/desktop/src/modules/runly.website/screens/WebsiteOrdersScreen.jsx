import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, DataTable, ErrorState, SelectField, Sheet, SheetContent, SheetHeader, SheetTitle, StatusPill } from '@runly/ui'
import { ShoppingBag } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { SiteSectionHeader } from '../components/SiteSectionHeader.jsx'
import { describeError } from '../lib/websiteErrors.js'
import { formatMoney, orderStatus, ORDER_STATUS_OPTIONS } from '../lib/orders.js'

const formatDate = (value) => (value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

// "Pedidos": what the site sold through its cart. Staff see every order and can ask Stripe about a pending one.
export default function WebsiteOrdersScreen({ siteId }) {
  const { session } = useAuth()
  const token = session?.access_token
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('')
  const [openId, setOpenId] = useState(null)

  const list = useQuery({
    queryKey: ['website-orders', siteId, status],
    queryFn: () => runly.website.listOrders(siteId, { ...(status ? { status } : {}), limit: 50 }, token),
    enabled: Boolean(token && siteId),
  })
  const detail = useQuery({
    queryKey: ['website-order', siteId, openId],
    queryFn: () => runly.website.getOrder(siteId, openId, token),
    enabled: Boolean(token && siteId && openId),
  })
  const verify = useMutation({
    mutationFn: (orderId) => runly.website.verifyOrder(siteId, orderId, token),
    onSuccess: (res) => {
      toast.success(res.data.status === 'paid' ? 'Pago confirmado' : 'Pedido actualizado')
      queryClient.invalidateQueries({ queryKey: ['website-orders', siteId] })
      queryClient.invalidateQueries({ queryKey: ['website-order', siteId] })
    },
    onError: (error) => toast.error(describeError(error).message),
  })

  const orders = list.data?.data?.items ?? []
  const columns = useMemo(() => [
    { id: 'number', header: 'Pedido', accessorFn: (o) => o.number, cell: ({ row }) => <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => setOpenId(row.original.id)}>#{row.original.number}</button> },
    { id: 'status', header: 'Estado', accessorFn: (o) => o.status, cell: ({ row }) => { const s = orderStatus(row.original.status); return <StatusPill tone={s.tone} size="sm">{s.label}</StatusPill> } },
    { id: 'customer', header: 'Cliente', accessorFn: (o) => o.customer.name ?? o.customer.email ?? 'Visitante' },
    { id: 'total', header: 'Total', accessorFn: (o) => o.total, cell: ({ row }) => formatMoney(row.original.total, row.original.currency) },
    { id: 'date', header: 'Fecha', accessorFn: (o) => o.createdAt, cell: ({ row }) => formatDate(row.original.createdAt) },
  ], [])

  const order = detail.data?.data
  return (
    <div className="space-y-4 p-4 md:p-6">
      <SiteSectionHeader icon={ShoppingBag} tone="emerald" title="Pedidos" description="Lo que tus visitantes compran en el sitio. Un pedido queda pagado cuando el proveedor de pagos lo confirma." />
      <div className="max-w-xs">
        <SelectField label="Estado" value={status} onChange={(e) => setStatus(e.target.value)} options={ORDER_STATUS_OPTIONS} />
      </div>
      {list.isError ? <ErrorState title={describeError(list.error).title} description={describeError(list.error).message} onRetry={() => list.refetch()} /> : (
        <DataTable
          columns={columns} data={orders} getRowId={(o) => o.id} isLoading={list.isPending} showToolbar={false} pageSize={10}
          stateKey={`website-orders-${siteId}`} emptyIcon={ShoppingBag}
          emptyTitle={status ? 'Sin pedidos con ese estado' : 'Aún no hay pedidos'}
          emptyDescription="Los pedidos aparecerán aquí cuando alguien use el carrito del sitio."
        />
      )}
      {list.data?.data?.next && <p className="text-xs text-[hsl(var(--muted-foreground))]">Mostrando los pedidos más recientes; filtra por estado para acotar.</p>}

      <Sheet open={Boolean(openId)} onOpenChange={(open) => { if (!open) setOpenId(null) }}>
        <SheetContent>
          <SheetHeader><SheetTitle>{order ? `Pedido #${order.number}` : 'Pedido'}</SheetTitle></SheetHeader>
          {detail.isError && <ErrorState title="No se pudo abrir el pedido" description={describeError(detail.error).message} onRetry={() => detail.refetch()} />}
          {order && (
            <div className="space-y-4 p-4 text-sm">
              <p><StatusPill tone={orderStatus(order.status).tone} size="sm">{orderStatus(order.status).label}</StatusPill> · {formatDate(order.paidAt ?? order.createdAt)}</p>
              <p>Cliente: {order.customer.name ?? '—'} {order.customer.email ? `· ${order.customer.email}` : ''}{order.customer.accountId ? ' · con cuenta' : ''}</p>
              <ul className="divide-y rounded-lg border">
                {order.lines.map((line, index) => (
                  <li key={`${line.productId}-${index}`} className="flex justify-between gap-3 p-3"><span>{line.quantity} × {line.name}</span><span>{formatMoney(line.unitPrice * line.quantity, line.currency)}</span></li>
                ))}
              </ul>
              <p className="text-right text-base font-semibold">Total {formatMoney(order.total, order.currency)}</p>
              {order.status === 'pending' && <Button disabled={verify.isPending} onClick={() => verify.mutate(order.id)}>Verificar pago con Stripe</Button>}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  )
}
