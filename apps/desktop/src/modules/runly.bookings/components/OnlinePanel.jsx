import { useEffect, useState } from 'react'
import {
  Button, CheckboxField, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, SectionCard, Skeleton, StatusPill,
  SwatchField, SwitchField, TextField, TextareaField, copyText,
} from '@runly/ui'
import { Copy, Eye, Globe, Loader2, Pencil, Plus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'
import { KEY, useBookingsMutation, useToken } from '../hooks/useBookings.js'
import { MUTED_TEXT, bookingsError } from '../lib/bookingsLabels.js'

// "Reservas online": publish the space and manage its public pages. Turning
// publication off keeps every booking; it only stops new self-scheduling.
export function OnlinePanel({ space, services, canEdit }) {
  const token = useToken()
  const pages = useQuery({ queryKey: [KEY, 'pages', space.id], queryFn: async () => (await runly.bookings.listPages(space.id, token))?.data ?? [], enabled: Boolean(token) })
  const [editing, setEditing] = useState(null)
  const publish = useBookingsMutation((t, published) => runly.bookings.updateSpace(space.id, { published }, t), { success: (_d, v) => (v ? 'Reservas online activadas.' : 'Reservas online desactivadas. Las reservaciones existentes se conservan.') })
  const save = useBookingsMutation((t, { id, data }) => (id ? runly.bookings.updatePage(id, data, t) : runly.bookings.createPage(space.id, data, t)), { success: 'Página guardada.' })

  async function preview(page) {
    try {
      const res = await runly.bookings.previewPage(page.id, token)
      window.open(res?.data?.url, '_blank', 'noopener')
    } catch (error) { toast.error(bookingsError(error)) }
  }
  async function copy(page) {
    await copyText(page.url)
    toast.success('Enlace copiado.')
  }
  const serviceName = new Map(services.map((s) => [s.id, s.name]))

  return (
    <div className="space-y-4">
      <SectionCard title="Reservas online" icon={Globe} description="Permite que tus clientes reserven solos desde un enlace, sin cuenta de Runly. Usa los mismos servicios, horarios y políticas de este sistema.">
        <SwitchField
          id="bookings-space-published"
          label="Publicar este sistema"
          description={space.published ? 'Las páginas publicadas aceptan reservaciones.' : 'Ninguna página acepta reservaciones nuevas. Los clientes conservan el acceso a lo que ya reservaron.'}
          checked={Boolean(space.published)} disabled={!canEdit || publish.isPending}
          onChange={(published) => publish.mutate(published)}
        />
      </SectionCard>
      <SectionCard
        title="Páginas públicas"
        icon={Globe}
        description="Una página general o una por servicio. Cada una tiene su dirección, textos y políticas visibles."
        action={canEdit ? <Button type="button" variant="outline" size="sm" onClick={() => setEditing('new')}><Plus />Nueva página</Button> : null}
      >
        {pages.isPending ? <Skeleton className="h-24 w-full" /> : !pages.data?.length ? (
          <EmptyState icon={Globe} title="Sin páginas públicas" description={canEdit ? 'Crea una página y elige qué servicios se pueden reservar en ella.' : undefined} />
        ) : (
          <ul className="divide-y divide-[hsl(var(--border))]">
            {pages.data.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{p.title}</span>
                    <StatusPill tone={p.published && space.published ? 'success' : 'neutral'} size="sm">{p.published ? (space.published ? 'Publicada' : 'Publicada, sistema sin publicar') : 'Borrador'}</StatusPill>
                  </div>
                  <p className={`${MUTED_TEXT} break-all`}>{p.url}</p>
                  <p className={MUTED_TEXT}>{p.serviceIds.map((id) => serviceName.get(id)).filter(Boolean).join(', ') || 'Sin servicios'}</p>
                </div>
                <div className="flex flex-wrap gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => copy(p)}><Copy />Copiar enlace</Button>
                  {canEdit ? <Button type="button" variant="ghost" size="sm" onClick={() => preview(p)}><Eye />Vista previa</Button> : null}
                  {canEdit ? <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(p)}><Pencil />Editar</Button> : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
      <PageFormDialog
        open={Boolean(editing)} onOpenChange={(v) => !v && setEditing(null)} page={editing === 'new' ? null : editing} services={services} pending={save.isPending}
        onSubmit={async (data) => { await save.mutateAsync({ id: editing === 'new' ? null : editing.id, data }).then(() => setEditing(null)).catch(() => {}) }}
      />
    </div>
  )
}

const EMPTY = { slug: '', title: '', description: '', location: '', instructions: '', serviceIds: [], published: false, allowResourceChoice: false, requirePhone: false, cancellationPolicy: '', reschedulePolicy: '', punctualityPolicy: '', privacyNotice: '', accentColor: '' }

function PageFormDialog({ open, onOpenChange, page, services, onSubmit, pending }) {
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  useEffect(() => { if (open) { setForm(page ? { ...EMPTY, ...Object.fromEntries(Object.entries(page).map(([k, v]) => [k, v ?? (Array.isArray(EMPTY[k]) ? [] : EMPTY[k])])) } : EMPTY); setErrors({}) } }, [open, page])
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const active = services.filter((s) => s.enabled)

  async function submit(event) {
    event.preventDefault()
    const next = {}
    if (!/^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/.test(form.slug)) next.slug = 'De 3 a 64 caracteres: minúsculas, números y guiones.'
    if (form.slug === 'gestion') next.slug = 'Esa dirección está reservada.'
    if (!form.title.trim()) next.title = 'Escribe un título.'
    if (form.published && !form.serviceIds.length) next.services = 'Elige al menos un servicio para publicar la página.'
    if (form.accentColor && !/^#[0-9a-fA-F]{6}$/.test(form.accentColor)) next.accentColor = 'Usa un color #RRGGBB.'
    setErrors(next)
    if (Object.keys(next).length) return
    const text = (v) => v?.trim() || null
    await onSubmit({
      slug: form.slug, title: form.title.trim(), description: text(form.description), location: text(form.location), instructions: text(form.instructions),
      serviceIds: form.serviceIds, published: form.published, allowResourceChoice: form.allowResourceChoice, requirePhone: form.requirePhone,
      cancellationPolicy: text(form.cancellationPolicy), reschedulePolicy: text(form.reschedulePolicy), punctualityPolicy: text(form.punctualityPolicy),
      privacyNotice: text(form.privacyNotice), accentColor: form.accentColor || null,
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="lg" className="gap-0 p-0 md:p-0 md:pt-0!">
        <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col" noValidate>
          <DialogHeader icon={Globe} className="mb-0 shrink-0 px-5 pt-4 pb-3">
            <DialogTitle>{page ? 'Editar página pública' : 'Nueva página pública'}</DialogTitle>
            <DialogDescription>Lo que verán tus clientes. Si cambias las políticas, los clientes deben aceptarlas de nuevo.</DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Título" required value={form.title} onChange={set('title')} error={errors.title} maxLength={160} placeholder="Ej. Agenda tu consulta" />
              <TextField label="Dirección (slug)" required value={form.slug} onChange={(e) => setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() }))} error={errors.slug} hint={`.../app/p/reservar/${form.slug || 'tu-pagina'}`} />
            </div>
            <TextareaField label="Descripción" value={form.description} onChange={set('description')} rows={2} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Ubicación" value={form.location} onChange={set('location')} maxLength={500} placeholder="Calle, número, ciudad" />
              <SwatchField label="Color de la página (opcional)" value={form.accentColor || ''} onChange={(accentColor) => setForm((f) => ({ ...f, accentColor }))} error={errors.accentColor} />
            </div>
            <TextareaField label="Indicaciones para llegar o prepararse" value={form.instructions} onChange={set('instructions')} rows={2} />
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Servicios en esta página</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {active.map((s) => (
                  <CheckboxField key={s.id} label={s.name} checked={form.serviceIds.includes(s.id)}
                    onChange={(e) => setForm((f) => ({ ...f, serviceIds: e.target.checked ? [...f.serviceIds, s.id] : f.serviceIds.filter((x) => x !== s.id) }))} />
                ))}
              </div>
              {errors.services ? <p role="alert" className="text-xs text-[hsl(var(--destructive))]">{errors.services}</p> : null}
            </fieldset>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <SwitchField id="bookings-page-resource-choice" label="Elegir profesional" description="El cliente puede elegir quién lo atiende. Si no, el sistema asigna a cualquiera disponible." checked={form.allowResourceChoice} onChange={(allowResourceChoice) => setForm((f) => ({ ...f, allowResourceChoice }))} />
              <SwitchField id="bookings-page-require-phone" label="Teléfono obligatorio" description="Si está apagado, el teléfono es opcional." checked={form.requirePhone} onChange={(requirePhone) => setForm((f) => ({ ...f, requirePhone }))} />
            </div>
            <TextareaField label="Política de cancelación" value={form.cancellationPolicy} onChange={set('cancellationPolicy')} rows={2} />
            <TextareaField label="Política de reprogramación" value={form.reschedulePolicy} onChange={set('reschedulePolicy')} rows={2} />
            <TextareaField label="Puntualidad" value={form.punctualityPolicy} onChange={set('punctualityPolicy')} rows={2} />
            <TextareaField label="Aviso de privacidad" value={form.privacyNotice} onChange={set('privacyNotice')} rows={3} hint="Si lo dejas vacío se muestra un aviso breve: los datos se usan solo para gestionar la reservación." />
            <SwitchField id="bookings-page-published" label="Página publicada" description="Además, el sistema debe estar publicado en Reservas online." checked={form.published} onChange={(published) => setForm((f) => ({ ...f, published }))} />
          </div>
          <DialogFooter className="mt-0 shrink-0 border-t border-[hsl(var(--border))] px-5 py-3">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
            <Button type="submit" disabled={pending}>{pending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}Guardar página</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
