import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Alert, AlertDescription, Button, EmptyState, Skeleton, StatusPill } from '@runly/ui'
import { AlertTriangle, CalendarDays, Link2Off, Loader2, MailCheck, MapPin, Send, Ticket } from 'lucide-react'
import { isNetworkError, longDate, ticketsApi, ticketsError, time, unwrap } from './ticketPortalLib.js'

const STATUS = {
  ISSUED: { label: 'Vigente', tone: 'success' },
  USED: { label: 'Ya se usó para entrar', tone: 'neutral' },
  CANCELLED: { label: 'Cancelado', tone: 'danger' },
  EXPIRED: { label: 'Vencido', tone: 'danger' },
  PENDING_PAYMENT: { label: 'Pendiente de pago en taquilla', tone: 'warning' },
}

// The buyer's page (/app/p/mis-boletos#<link>): the link stays in the URL fragment, which
// browsers never send to a server. No codes or QR are shown here; they travel only by email.
export default function MyTicketsScreen() {
  const location = useLocation()
  const token = decodeURIComponent(location.hash.replace(/^#/, ''))
  const view = useQuery({ queryKey: ['my-tickets', token], queryFn: async () => unwrap(await ticketsApi.order(token)), enabled: Boolean(token), retry: false })
  const [sending, setSending] = useState(null)
  const [message, setMessage] = useState(null)
  const shell = (children) => <main className="mx-auto flex w-full max-w-2xl min-w-0 flex-col gap-5 px-4 py-6 sm:py-10">{children}</main>

  if (!token) return shell(<EmptyState icon={Link2Off} title="Falta el enlace" description="Abre el enlace completo «Ver mis boletos» que recibiste por correo." />)
  if (view.isPending) return shell(<><Skeleton className="h-16 w-2/3" /><Skeleton className="h-64 w-full" /></>)
  if (view.isError) {
    return shell(<EmptyState icon={Link2Off} title="No pudimos abrir tus boletos" description={ticketsError(view.error)} action={isNetworkError(view.error) ? <Button type="button" onClick={() => view.refetch()}>Reintentar</Button> : null} />)
  }
  const o = view.data
  const tz = o.event.timezone

  async function resend(ticketIds = null) {
    setSending(ticketIds?.[0] ?? 'all'); setMessage(null)
    try {
      await ticketsApi.resend(token, ticketIds)
      setMessage({ tone: 'ok', text: 'Listo. Si el correo es correcto, te llegará en unos minutos (revisa también spam). Tus QR no cambian.' })
    } catch (error) {
      setMessage({ tone: 'error', text: ticketsError(error) })
    } finally { setSending(null) }
  }
  const resendable = o.tickets.filter((t) => t.resendable)

  return shell(
    <>
      <header className="flex items-center gap-3">
        {o.company?.logoUrl ? <img src={o.company.logoUrl} alt="" className="h-12 w-12 shrink-0 rounded-md object-contain" /> : (
          <span aria-hidden="true" className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-(--brand-primary) text-(--brand-primary-foreground)"><Ticket className="h-5 w-5" /></span>
        )}
        <div className="min-w-0">
          <p className="truncate text-sm text-[hsl(var(--muted-foreground))]">{o.company?.name}</p>
          <h1 className="text-xl font-semibold leading-tight sm:text-2xl">Mis boletos</h1>
        </div>
      </header>
      {message ? <Alert variant={message.tone === 'error' ? 'destructive' : 'default'} aria-live="polite">{message.tone === 'error' ? <AlertTriangle className="h-4 w-4" /> : <MailCheck className="h-4 w-4" />}<AlertDescription>{message.text}</AlertDescription></Alert> : null}
      <section className="space-y-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 sm:p-5">
        <h2 className="text-lg font-semibold">{o.event.title}</h2>
        <p className="flex items-center gap-2 text-sm"><CalendarDays className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />{longDate(o.session.startsAt, tz)}, {time(o.session.startsAt, tz)}</p>
        {o.event.venue ? <p className="flex items-center gap-2 text-sm"><MapPin className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />{o.event.venue}</p> : null}
        {o.session.status === 'cancelled' ? <StatusPill tone="danger">Función cancelada</StatusPill> : null}
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Orden {o.reference} · {o.quantity} {o.quantity === 1 ? 'boleto' : 'boletos'}</p>
      </section>
      <section className="space-y-2" aria-label="Boletos de la orden">
        {o.tickets.map((t, i) => {
          const s = STATUS[t.status] ?? { label: t.status, tone: 'neutral' }
          return (
            <div key={t.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-3 sm:flex-nowrap">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">Boleto {i + 1} · {t.type}</p>
                <p className="truncate text-sm text-[hsl(var(--muted-foreground))]">{t.holderName}</p>
                <div className="mt-1 flex flex-wrap gap-1.5"><StatusPill tone={s.tone} size="sm">{s.label}</StatusPill>{t.replaced && t.status === 'ISSUED' ? <StatusPill tone="neutral" size="sm">QR reemplazado</StatusPill> : null}</div>
              </div>
              {t.resendable ? (
                <Button type="button" variant="outline" size="sm" disabled={Boolean(sending)} onClick={() => resend([t.id])}>
                  {sending === t.id ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Send />}Reenviar
                </Button>
              ) : null}
            </div>
          )
        })}
      </section>
      {resendable.length > 1 ? <Button type="button" disabled={Boolean(sending)} onClick={() => resend(null)}>{sending === 'all' ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Send />}Reenviar todos por correo</Button> : null}
      <p className="text-xs text-[hsl(var(--muted-foreground))]">Reenviar manda los mismos boletos al correo registrado; no cambia tus códigos QR. Si perdiste el control de un boleto, pide al organizador que lo reemita: el QR anterior dejará de servir.</p>
    </>
  )
}
