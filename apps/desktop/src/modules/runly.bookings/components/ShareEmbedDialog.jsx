import { useEffect, useMemo, useState } from 'react'
import {
  Alert, AlertDescription, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  SelectField, TextField, TextareaField, copyText,
} from '@runly/ui'
import { normalizeEmbedOrigin } from '@runly/validators'
import { AlertTriangle, Copy, Loader2, Plus, Share2, X } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'
import { useBookingsMutation } from '../hooks/useBookings.js'
import { MUTED_TEXT } from '../lib/bookingsLabels.js'
import { embedSnippets } from '../lib/embedSnippets.js'

const ALL = 'all'

// "Compartir e integrar": the page's direct link, an embedded calendar and a button
// for any website, plus the sites allowed to show it inside an iframe. Bookings made
// through any of them go through the same Booking Engine as the page itself.
export function ShareEmbedDialog({ open, onOpenChange, page, services, live, canEdit }) {
  const [serviceId, setServiceId] = useState(ALL)
  const [origins, setOrigins] = useState([])
  const [draft, setDraft] = useState('')
  const [error, setError] = useState('')
  useEffect(() => { if (open && page) { setOrigins(page.embedOrigins ?? []); setDraft(''); setError(''); setServiceId(ALL) } }, [open, page])
  const save = useBookingsMutation((t, embedOrigins) => runly.bookings.updatePage(page.id, { embedOrigins }, t), { success: 'Sitios autorizados guardados.' })
  const snippets = useMemo(() => (page?.url ? embedSnippets({ url: page.url, serviceId: serviceId === ALL ? null : serviceId, color: page.accentColor }) : null), [page, serviceId])
  if (!page) return null
  const pageServices = services.filter((s) => page.serviceIds.includes(s.id))
  const dirty = JSON.stringify(origins) !== JSON.stringify(page.embedOrigins ?? [])

  function add(event) {
    event?.preventDefault()
    const origin = normalizeEmbedOrigin(draft)
    if (!origin) { setError('Escribe la dirección del sitio, por ejemplo https://www.tunegocio.com (sin rutas ni asteriscos).'); return }
    if (origins.length >= 20) { setError('Puedes autorizar hasta 20 sitios.'); return }
    setOrigins((list) => (list.includes(origin) ? list : [...list, origin])); setDraft(''); setError('')
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="lg" className="gap-0 p-0 md:p-0 md:pt-0!">
        <DialogHeader icon={Share2} className="mb-0 shrink-0 px-5 pt-4 pb-3">
          <DialogTitle>Compartir e integrar</DialogTitle>
          <DialogDescription>{page.title}: comparte el enlace o muestra el calendario en tu sitio web. La disponibilidad y las reglas siguen siendo las de este sistema.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {!live ? (
            <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>La página o el sistema no están publicados: el enlace y el calendario mostrarán «Página no disponible» hasta que los publiques.</AlertDescription></Alert>
          ) : null}
          {pageServices.length > 1 ? (
            <SelectField label="Servicio" value={serviceId} onValueChange={setServiceId}
              options={[{ value: ALL, label: 'Todos los servicios de la página' }, ...pageServices.map((s) => ({ value: s.id, label: s.name }))]}
              hint="Con un servicio elegido, el cliente empieza directamente en sus horarios." />
          ) : null}
          {snippets ? (
            <>
              <Snippet id="share-link" label="Enlace directo" description="Para redes sociales, WhatsApp, correo o un código QR." value={snippets.link} rows={2} />
              <Snippet id="share-iframe" label="Calendario integrado" description="Pégalo en tu sitio web. El script opcional ajusta la altura al contenido; sin él, el calendario usa 760 px de alto." value={snippets.iframe} rows={5} />
              <Snippet id="share-button" label="Botón de reservación" description="Abre las reservaciones en una pestaña nueva. Funciona en cualquier sitio, aunque no esté autorizado." value={snippets.button} rows={4} />
            </>
          ) : (
            <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>La instancia no tiene configurada su dirección pública, así que todavía no hay enlace que compartir.</AlertDescription></Alert>
          )}

          <section className="space-y-3" aria-labelledby="share-origins-title">
            <div>
              <h3 id="share-origins-title" className="text-sm font-semibold">Sitios autorizados para el calendario integrado</h3>
              <p className={MUTED_TEXT}>Solo estos sitios pueden mostrar la página dentro de un iframe; en cualquier otro el navegador lo bloquea. Tus sitios publicados con Runly Website ya están autorizados.</p>
            </div>
            {origins.length ? (
              <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
                {origins.map((origin) => (
                  <li key={origin} className="flex min-h-11 items-center justify-between gap-2 py-1 pr-1 pl-3">
                    <span className="min-w-0 break-all text-sm">{origin}</span>
                    {canEdit ? <Button type="button" variant="ghost" size="icon" className="h-11 w-11 shrink-0" aria-label={`Quitar ${origin}`} onClick={() => setOrigins((list) => list.filter((o) => o !== origin))}><X /></Button> : null}
                  </li>
                ))}
              </ul>
            ) : <p className={MUTED_TEXT}>Todavía no hay sitios externos autorizados.</p>}
            {canEdit ? (
              <form className="flex flex-col gap-2 sm:flex-row sm:items-start" onSubmit={add} noValidate>
                <div className="min-w-0 flex-1">
                  <TextField label="Agregar sitio" value={draft} onChange={(e) => { setDraft(e.target.value); setError('') }} error={error}
                    placeholder="https://www.tunegocio.com" inputMode="url" autoComplete="off" />
                </div>
                <Button type="submit" variant="outline" className="sm:mt-6"><Plus />Agregar</Button>
              </form>
            ) : null}
          </section>
        </div>
        <DialogFooter className="mt-0 shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          {canEdit ? (
            <Button type="button" disabled={!dirty || save.isPending} onClick={() => save.mutateAsync(origins).then(() => onOpenChange(false)).catch(() => {})}>
              {save.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}Guardar sitios autorizados
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Snippet({ id, label, description, value, rows }) {
  return (
    <div className="space-y-2">
      <TextareaField id={id} label={label} hint={description} value={value} readOnly rows={rows} className="font-mono text-xs" onFocus={(e) => e.target.select()} />
      <Button type="button" variant="outline" size="sm" onClick={async () => { await copyText(value); toast.success(`${label}: copiado.`) }}><Copy />Copiar</Button>
    </div>
  )
}
