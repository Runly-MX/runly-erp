import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Alert, AlertDescription, Button, Card, CardContent, CardDescription, CardHeader, CardTitle, ConfirmDialog, Dialog, DialogContent,
  DialogDescription, DialogFooter, DialogHeader, DialogTitle, Skeleton, StatusPill, TextField,
} from '@runly/ui'
import { AlertTriangle, CalendarCheck, ExternalLink, Loader2, Plus, RotateCcw, X } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider'
import { runly } from '../../../lib/runly'

const KIND = {
  tables: { title: 'Reservas de mesas', what: 'reservas de mesas', legacy: 'Cada reserva marca la mesa como reservada todo el día y no hay horarios.' },
  appointments: { title: 'Citas', what: 'citas', legacy: 'Las citas no se revisan contra otras: pueden empalmarse.' },
}
const browserZone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Mexico_City' } catch { return 'America/Mexico_City' } }
const when = (value) => new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })

// Per outlet: move table reservations and/or appointments onto the Reservaciones engine
// (real times, capacity and no overlaps), with a preview first and a way back.
export default function PosBookingsLinkPanel({ outlets = [], appointmentsEnabled = false }) {
  const kinds = (outlet) => [['RESTAURANT', 'HYBRID'].includes(outlet.mode) ? 'tables' : null, appointmentsEnabled ? 'appointments' : null].filter(Boolean)
  const rows = outlets.filter((o) => o.enabled !== false).flatMap((outlet) => kinds(outlet).map((kind) => ({ outlet, kind })))
  return (
    <Card>
      <CardHeader>
        <CardTitle>Reservaciones y citas</CardTitle>
        <CardDescription>Usa el sistema de Reservaciones para tus mesas y citas: horarios reales, capacidad de cada mesa, varias reservas por mesa en el día y citas sin empalmes. Se activa por sucursal y puedes volver al modo anterior sin perder reservas.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {rows.length ? rows.map(({ outlet, kind }) => <LinkRow key={`${outlet.id}:${kind}`} outlet={outlet} kind={kind} />) : (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Ninguna sucursal maneja mesas y las citas están apagadas.</p>
        )}
      </CardContent>
    </Card>
  )
}

function LinkRow({ outlet, kind }) {
  const { session } = useAuth()
  const token = session?.access_token
  const client = useQueryClient()
  const links = useQuery({ queryKey: ['pos-bookings-links', outlet.id, token], queryFn: async () => (await runly.pos.bookings.links(outlet.id, token)).data ?? [], enabled: Boolean(token) })
  const link = links.data?.find((l) => l.kind === kind)
  const active = link?.mode === 'engine'
  const [open, setOpen] = useState(false)
  const [confirmBack, setConfirmBack] = useState(false)
  const [busy, setBusy] = useState(false)

  async function rollback() {
    setBusy(true)
    try {
      const res = (await runly.pos.bookings.rollback({ outletId: outlet.id, kind }, token)).data
      toast.success(`Modo anterior activo. ${res.copied + res.updated} reserva(s) siguen disponibles en POS.`)
      client.invalidateQueries({ queryKey: ['pos-bookings-links'] })
    } catch (error) { toast.error(error?.message ?? 'No se pudo volver al modo anterior.') } finally { setBusy(false); setConfirmBack(false) }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[hsl(var(--border))] p-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{outlet.name} · {KIND[kind].title}</span>
          {links.isPending ? <Skeleton className="h-5 w-24" /> : <StatusPill tone={active ? 'success' : 'neutral'} size="sm">{active ? 'Con Reservaciones' : link ? 'Modo anterior' : 'Sin activar'}</StatusPill>}
        </div>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">{active ? `Desde ${when(link.activatedAt)}. Los horarios y la capacidad los decide Reservaciones.` : KIND[kind].legacy}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        {active ? (
          <>
            <Button variant="outline" asChild><a href={`/app/m/runly.bookings/spaces/${link.spaceId}`}><ExternalLink />Abrir en Reservaciones</a></Button>
            <Button variant="ghost" onClick={() => setConfirmBack(true)} disabled={busy}><RotateCcw />Volver al modo anterior</Button>
          </>
        ) : <Button onClick={() => setOpen(true)}><CalendarCheck />Revisar y activar</Button>}
      </div>
      {open ? <ActivateDialog outlet={outlet} kind={kind} hasLink={Boolean(link)} token={token} onClose={() => setOpen(false)} onDone={() => { setOpen(false); client.invalidateQueries({ queryKey: ['pos-bookings-links'] }) }} /> : null}
      <ConfirmDialog
        open={confirmBack} onOpenChange={setConfirmBack} tone="destructive" icon={RotateCcw} title="Volver al modo anterior"
        description={`POS dejará de usar Reservaciones para las ${KIND[kind].what} de ${outlet.name}. Las reservas vigentes se copian a POS y la página pública de este sistema se despublica. Puedes volver a activarlo después.`}
        confirmLabel="Volver al modo anterior" onConfirm={rollback}
      />
    </div>
  )
}

function ActivateDialog({ outlet, kind, hasLink, token, onClose, onDone }) {
  const needsPeople = kind === 'appointments' && !hasLink
  const [people, setPeople] = useState([])
  const [draft, setDraft] = useState('')
  const [report, setReport] = useState(null)
  const [state, setState] = useState('idle')
  const [error, setError] = useState('')
  const body = () => ({ outletId: outlet.id, kind, timezone: browserZone(), ...(needsPeople ? { professionals: people.map((name) => ({ name })) } : {}) })

  async function review() {
    if (needsPeople && !people.length) { setError('Agrega al menos un profesional.'); return }
    setState('reviewing'); setError('')
    try { setReport((await runly.pos.bookings.preview(body(), token)).data); setState('reviewed') } catch (e) { setError(e?.message ?? 'No se pudo revisar.'); setState('idle') }
  }
  async function activate() {
    setState('activating')
    try {
      const res = (await runly.pos.bookings.activate(body(), token)).data
      toast.success(`Reservaciones activo en ${outlet.name}. ${res.carried} registro(s) trasladado(s).`)
      onDone()
    } catch (e) { setError(e?.message ?? 'No se pudo activar.'); if (e?.details?.report) setReport(e.details.report); setState('reviewed') }
  }
  const add = (event) => { event.preventDefault(); const name = draft.trim(); if (name && !people.includes(name)) setPeople((p) => [...p, name]); setDraft(''); setError('') }

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent scrollable size="lg" className="gap-0 p-0 md:p-0 md:pt-0!">
        <DialogHeader icon={CalendarCheck} className="mb-0 shrink-0 px-5 pt-4 pb-3">
          <DialogTitle>Activar Reservaciones en {outlet.name}</DialogTitle>
          <DialogDescription>Primero se revisa sin cambiar nada: cuántas {KIND[kind].what} vigentes se trasladan y cuáles no caben.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
          {needsPeople ? (
            <section className="space-y-2" aria-labelledby="pos-pros-title">
              <h3 id="pos-pros-title" className="text-sm font-semibold">Profesionales que atienden citas</h3>
              <p className="text-sm text-[hsl(var(--muted-foreground))]">Cada uno tiene su propia agenda: dos citas al mismo tiempo necesitan dos profesionales libres.</p>
              {people.length ? (
                <ul className="flex flex-wrap gap-2">
                  {people.map((name) => (
                    <li key={name} className="flex min-h-11 items-center gap-1 rounded-md border border-[hsl(var(--border))] pl-3">
                      {name}<Button variant="ghost" size="icon" className="h-11 w-11" aria-label={`Quitar a ${name}`} onClick={() => setPeople((p) => p.filter((x) => x !== name))}><X /></Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <form className="flex flex-col gap-2 sm:flex-row sm:items-end" onSubmit={add}>
                <div className="min-w-0 flex-1"><TextField label="Nombre del profesional" value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={120} /></div>
                <Button type="submit" variant="outline"><Plus />Agregar</Button>
              </form>
            </section>
          ) : null}
          {report ? (
            <div className="space-y-2" aria-live="polite">
              <p className="text-sm"><strong>{report.carried}</strong> registro(s) vigente(s) se trasladan{kind === 'tables' ? ` · ${report.resources} mesa(s)` : ''}.{report.reconciled ? ` ${report.reconciled} cambio(s) del modo anterior se aplican.` : ''}</p>
              {report.conflicts?.length ? (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    <p className="font-medium">No se puede activar todavía: {report.conflicts.length} registro(s) no caben. Cancélalos, cámbialos de hora o de mesa en POS y vuelve a revisar.</p>
                    <ul className="mt-2 list-disc space-y-1 pl-5">
                      {report.conflicts.map((c) => <li key={c.id}>{c.name ?? 'Registro'} · {when(c.startsAt)}: {c.reason}</li>)}
                    </ul>
                  </AlertDescription>
                </Alert>
              ) : <p className="text-sm text-[hsl(var(--muted-foreground))]">Todo cabe. Al activar, las mesas dejan de quedar «Reservadas» todo el día: Reservaciones guarda cada horario.</p>}
            </div>
          ) : null}
          {error ? <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{error}</p> : null}
        </div>
        <DialogFooter className="mt-0 shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
          <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
          {state !== 'reviewed' || report?.conflicts?.length ? (
            <Button type="button" onClick={review} disabled={state === 'reviewing'}>{state === 'reviewing' ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}{report ? 'Revisar de nuevo' : 'Revisar'}</Button>
          ) : (
            <Button type="button" onClick={activate} disabled={state === 'activating'}>{state === 'activating' ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}Activar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
