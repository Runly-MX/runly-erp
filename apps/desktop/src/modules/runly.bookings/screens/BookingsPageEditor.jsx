import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CheckboxField, LoadingState, NotFoundState, StatusPill, SwatchField, SwitchField, TextField, TextareaField } from '@runly/ui'
import { FileText, Globe, ListChecks, MapPin, Palette, ShieldCheck } from 'lucide-react'
import { runly } from '../../../lib/runly.js'
import { FormActionBar, FormPage, FormSection, useLeaveGuard } from '../components/FormPage.jsx'
import { KEY, useBookingsMutation, useToken } from '../hooks/useBookings.js'
import { MUTED_TEXT, bookingsPath } from '../lib/bookingsLabels.js'

const EMPTY = { slug: '', title: '', description: '', location: '', instructions: '', serviceIds: [], published: false, allowResourceChoice: false, requirePhone: false, cancellationPolicy: '', reschedulePolicy: '', punctualityPolicy: '', privacyNotice: '', accentColor: '' }
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/
const toForm = (page) => ({ ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, page[k] ?? EMPTY[k]])) })
// "Agenda tu consulta" -> "agenda-tu-consulta"; only while the slug was never typed by hand.
const slugOf = (title) => title.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64)

// Nueva / Editar página pública of "Reservas online", as a full page with a
// live preview of what the customer sees.
export default function BookingsPageEditor({ space, pageId, services, canConfigure }) {
  const token = useToken()
  const pages = useQuery({ queryKey: [KEY, 'pages', space.id], queryFn: async () => (await runly.bookings.listPages(space.id, token))?.data ?? [], enabled: Boolean(token) })
  const isNew = pageId === 'new'
  const page = isNew ? null : (pages.data ?? []).find((p) => p.id === pageId)
  if (!canConfigure) return <NotFoundState title="Sin permiso" description="Solo los administradores del sistema editan las páginas públicas." />
  if (!isNew && pages.isPending) return <LoadingState />
  if (!isNew && !page) return <NotFoundState title="Página no encontrada" description="Ya no existe o pertenece a otro sistema." />
  return <PageEditorForm key={pageId} space={space} page={page} services={services} />
}

function PageEditorForm({ space, page, services }) {
  const navigate = useNavigate()
  const [initial] = useState(() => (page ? toForm(page) : EMPTY))
  const [form, setForm] = useState(initial)
  const [slugTouched, setSlugTouched] = useState(Boolean(page))
  const [attempted, setAttempted] = useState(false)
  const dirty = JSON.stringify(form) !== JSON.stringify(initial)
  const { leave, commit, dialog } = useLeaveGuard(dirty)
  const back = () => navigate(bookingsPath(`/spaces/${space.id}?tab=online`))
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const active = services.filter((s) => s.enabled)
  const save = useBookingsMutation((t, data) => (page ? runly.bookings.updatePage(page.id, data, t) : runly.bookings.createPage(space.id, data, t)), { success: page ? 'Página guardada.' : 'Página creada.' })

  const problems = validate(form)
  const errors = attempted ? problems : {}

  async function submit(event) {
    event.preventDefault()
    setAttempted(true)
    if (Object.keys(problems).length) { requestAnimationFrame(() => document.querySelector('form [aria-invalid="true"]')?.focus()); return }
    const text = (v) => v?.trim() || null
    const ok = await save.mutateAsync({
      slug: form.slug, title: form.title.trim(), description: text(form.description), location: text(form.location), instructions: text(form.instructions),
      serviceIds: form.serviceIds, published: form.published, allowResourceChoice: form.allowResourceChoice, requirePhone: form.requirePhone,
      cancellationPolicy: text(form.cancellationPolicy), reschedulePolicy: text(form.reschedulePolicy), punctualityPolicy: text(form.punctualityPolicy),
      privacyNotice: text(form.privacyNotice), accentColor: form.accentColor || null,
    }).then(() => true).catch(() => false)
    if (ok) commit(back)
  }

  const status = save.isPending ? 'Guardando…'
    : form.published && !form.serviceIds.length ? 'Para publicarla, elige al menos un servicio.'
      : dirty ? <span className="font-medium text-[hsl(var(--foreground))]">Cambios sin guardar</span> : page ? 'Sin cambios' : ''

  return (
    <>
      <FormPage
        onSubmit={submit}
        onBack={() => leave(back)}
        backLabel="Reservas online"
        eyebrow={`Reservaciones · ${space.name}`}
        title={page ? `Editar ${page.title}` : 'Nueva página pública'}
        description="Lo que verán tus clientes al reservar. Si cambias las políticas, deberán aceptarlas de nuevo."
        aside={<PagePreview form={form} services={active} spacePublished={Boolean(space.published)} />}
        footer={<FormActionBar status={status} pending={save.isPending} submitLabel={page ? 'Guardar cambios' : 'Crear página'} onCancel={() => leave(back)} />}
      >
        <FormSection icon={FileText} title="Página" description="Título y dirección del enlace que compartirás.">
          <TextField label="Título" required value={form.title} error={errors.title} maxLength={160} placeholder="Ej. Agenda tu consulta" autoFocus={!page}
            onChange={(e) => { const title = e.target.value; setForm((f) => ({ ...f, title, ...(slugTouched ? {} : { slug: slugOf(title) }) })) }} />
          <TextField label="Dirección (slug)" required value={form.slug} error={errors.slug} autoComplete="off" hint={`.../app/p/reservar/${form.slug || 'tu-pagina'}`}
            onChange={(e) => { setSlugTouched(true); setForm((f) => ({ ...f, slug: e.target.value.toLowerCase() })) }} />
          <TextareaField label="Descripción" value={form.description} onChange={set('description')} rows={3} />
        </FormSection>

        <FormSection icon={MapPin} title="Lugar e indicaciones">
          <TextField label="Ubicación" value={form.location} onChange={set('location')} maxLength={500} placeholder="Calle, número, ciudad" />
          <TextareaField label="Indicaciones para llegar o prepararse" value={form.instructions} onChange={set('instructions')} rows={3} />
        </FormSection>

        <FormSection icon={ListChecks} title="Servicios y datos del cliente">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-medium">Servicios en esta página</legend>
            {active.length ? (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {active.map((s) => (
                  <CheckboxField key={s.id} label={s.name} checked={form.serviceIds.includes(s.id)}
                    onChange={(e) => setForm((f) => ({ ...f, serviceIds: e.target.checked ? [...f.serviceIds, s.id] : f.serviceIds.filter((x) => x !== s.id) }))} />
                ))}
              </div>
            ) : <p className={MUTED_TEXT}>Este sistema no tiene servicios activos. Puedes guardar la página como borrador y elegirlos después de crearlos en Servicios.</p>}
            {errors.services ? <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{errors.services}</p> : null}
          </fieldset>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <SwitchField id="bookings-page-resource-choice" label="Elegir profesional" description="El cliente elige quién lo atiende. Si no, se asigna a cualquiera disponible." checked={form.allowResourceChoice} onChange={(allowResourceChoice) => setForm((f) => ({ ...f, allowResourceChoice }))} />
            <SwitchField id="bookings-page-require-phone" label="Teléfono obligatorio" description="Si está apagado, el teléfono es opcional." checked={form.requirePhone} onChange={(requirePhone) => setForm((f) => ({ ...f, requirePhone }))} />
          </div>
        </FormSection>

        <FormSection icon={ShieldCheck} title="Políticas y avisos" description="Se muestran antes de confirmar; el cliente debe aceptarlas.">
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 lg:grid-cols-2">
            <TextareaField label="Política de cancelación" value={form.cancellationPolicy} onChange={set('cancellationPolicy')} rows={3} />
            <TextareaField label="Política de reprogramación" value={form.reschedulePolicy} onChange={set('reschedulePolicy')} rows={3} />
            <TextareaField label="Puntualidad" value={form.punctualityPolicy} onChange={set('punctualityPolicy')} rows={3} />
            <TextareaField label="Aviso de privacidad" value={form.privacyNotice} onChange={set('privacyNotice')} rows={3} hint="Vacío: se muestra un aviso breve, los datos solo se usan para gestionar la reservación." />
          </div>
        </FormSection>

        <FormSection icon={Palette} title="Apariencia">
          <SwatchField label="Color de la página (opcional)" value={form.accentColor || ''} onChange={(accentColor) => setForm((f) => ({ ...f, accentColor }))} error={errors.accentColor} />
        </FormSection>

        <FormSection icon={Globe} title="Publicación">
          <SwitchField id="bookings-page-published" label="Página publicada" description={space.published ? 'Acepta reservaciones en cuanto la guardes.' : 'El sistema aún no está publicado: actívalo en Reservas online para que esta página acepte reservaciones.'}
            checked={form.published} onChange={(published) => setForm((f) => ({ ...f, published }))} />
        </FormSection>
      </FormPage>
      {dialog}
    </>
  )
}

function validate(form) {
  const errors = {}
  if (!SLUG.test(form.slug)) errors.slug = 'De 3 a 64 caracteres: minúsculas, números y guiones.'
  else if (form.slug === 'gestion') errors.slug = 'Esa dirección está reservada.'
  if (!form.title.trim()) errors.title = 'Escribe un título.'
  if (form.published && !form.serviceIds.length) errors.services = 'Elige al menos un servicio para publicar la página.'
  if (form.accentColor && !/^#[0-9a-fA-F]{6}$/.test(form.accentColor)) errors.accentColor = 'Usa un color #RRGGBB.'
  return errors
}

function PagePreview({ form, services, spacePublished }) {
  const chosen = services.filter((s) => form.serviceIds.includes(s.id))
  const live = form.published && spacePublished
  return (
    <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))]">
      <div className="h-1.5" style={{ background: form.accentColor || 'hsl(var(--primary))' }} aria-hidden="true" />
      <div className="space-y-4 p-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium tracking-wide text-[hsl(var(--muted-foreground))] uppercase">Vista del cliente</p>
          <StatusPill tone={live ? 'success' : 'neutral'} size="sm">{live ? 'En línea' : form.published ? 'Sistema sin publicar' : 'Borrador'}</StatusPill>
        </div>
        <div>
          <p className="text-lg font-semibold leading-snug break-words">{form.title.trim() || 'Título de la página'}</p>
          {form.description.trim() ? <p className="mt-1 line-clamp-4 text-sm text-[hsl(var(--muted-foreground))]">{form.description}</p> : null}
          {form.location.trim() ? <p className="mt-2 flex items-start gap-1.5 text-sm"><MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />{form.location}</p> : null}
        </div>
        <div className="space-y-1.5">
          {chosen.length ? chosen.map((s) => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-md border border-[hsl(var(--border))] px-3 py-2 text-sm">
              <span className="truncate">{s.name}</span>
              <span className="shrink-0 tabular-nums text-[hsl(var(--muted-foreground))]">{s.durationMinutes} min</span>
            </div>
          )) : <p className={MUTED_TEXT}>Aún no eliges servicios.</p>}
        </div>
        <p className={`${MUTED_TEXT} break-all`}>.../app/p/reservar/{form.slug || 'tu-pagina'}</p>
      </div>
    </div>
  )
}
