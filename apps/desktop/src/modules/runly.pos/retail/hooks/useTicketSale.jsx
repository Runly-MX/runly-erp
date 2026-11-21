import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, AlertTitle, Button } from '@runly/ui'
import { Ticket } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../../lib/runly.js'
import { CredentialsDialog } from '../../../runly.ticketing/components/CredentialsDialog.jsx'

// Boletos (runly.ticketing D2): "Cobrar en Caja" opens the register with ?boletos=<order>.
// Its ticket products go into the sale; once Caja reports PAID the server reads the POS
// sale itself (status, lines, prices, currency) before issuing, and the QRs are shown
// here once to hand over. The same confirmation key is reused on retries.
export function useTicketSale({ sessionId, token, addItems }) {
  const [params, setParams] = useSearchParams()
  const client = useQueryClient()
  const orderId = params.get('boletos')
  const [ticketOrder, setTicketOrder] = useState(null)
  const [credentials, setCredentials] = useState(null)
  const confirmKey = useRef(null)
  const drop = () => { setTicketOrder(null); setParams((prev) => { const next = new URLSearchParams(prev); next.delete('boletos'); return next }, { replace: true }) }

  useEffect(() => {
    if (!orderId || !sessionId || ticketOrder?.id === orderId) return
    let stop = false
    ;(async () => {
      try {
        const sale = (await runly.ticketing.orderSale(orderId, token)).data
        if (stop) return
        if (sale.status !== 'PENDING_PAYMENT') { toast.error('Esta orden de boletos ya no espera un pago.'); drop(); return }
        setTicketOrder(sale)
        confirmKey.current = crypto.randomUUID()
        await addItems(sale.items.map((item) => ({ productId: item.productId, quantity: item.quantity })), `Cargando boletos de la orden ${sale.reference}`)
        toast.success(`Boletos de la orden ${sale.reference} cargados en la venta`)
      } catch (error) {
        if (!stop) { toast.error(error?.message ?? 'No se pudo cargar la orden de boletos.'); drop() }
      }
    })()
    return () => { stop = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId, sessionId])

  async function onPaid(posOrder) {
    if (!ticketOrder || posOrder?.status !== 'PAID') return
    const current = ticketOrder
    drop()
    try {
      const result = await runly.ticketing.confirmPayment(current.id, posOrder.id, token, confirmKey.current)
      client.invalidateQueries({ queryKey: ['ticketing'] })
      if (result.credentials?.length) setCredentials(result.credentials.map((c) => ({ ...c, label: current.eventTitle })))
      toast.success(`Pago verificado: boletos de la orden ${current.reference} emitidos`)
    } catch (error) {
      toast.error(`La venta se cobró, pero los boletos no se emitieron: ${error?.message ?? 'error'}. Confírmalos desde la orden en Boletos.`, { duration: 12000 })
    }
  }

  const banner = ticketOrder ? (
    <Alert className="mx-3 mt-3 w-auto">
      <Ticket className="h-4 w-4" aria-hidden="true" />
      <AlertTitle>Cobrando boletos · orden {ticketOrder.reference}</AlertTitle>
      <AlertDescription className="flex flex-wrap items-center gap-2">
        {ticketOrder.eventTitle}. Cóbralos sin descuentos: al pagar, la orden se verifica y se emiten los QR.
        <Button variant="ghost" size="sm" onClick={drop}>Desvincular</Button>
      </AlertDescription>
    </Alert>
  ) : null
  const dialog = <CredentialsDialog credentials={credentials} title="Boletos pagados" onClose={() => setCredentials(null)} />
  return { banner, dialog, onPaid }
}
