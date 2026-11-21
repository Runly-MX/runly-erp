import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button, CheckboxField, ChoiceCardGroup, LoadingState, NotFoundState, NumberField, StatusPill, SwitchField, TextField, TextareaField, cn,
} from '@runly/ui'
import { CheckCircle2, Circle, Clock3, ConciergeBell, Info, Plus, ToggleRight, User, Users, UsersRound } from 'lucide-react'
import { runly } from '../../../lib/runly.js'
import { FormActionBar, FormPage, FormSection, useLeaveGuard } from '../components/FormPage.jsx'
import { QuickResourcePanel } from '../components/QuickResourcePanel.jsx'
import { useBookingsMutation } from '../hooks/useBookings.js'
import { KIND, MUTED_TEXT, RESOURCE_TYPE, bookingsPath } from '../lib/bookingsLabels.js'
import { EMPTY_SERVICE, blockedMinutes, needsResource, sameForm, serviceToForm, serviceToPayload, validateService } from '../lib/serviceForm.js'

const KIND_OPTIONS = [
  { value: 'appointment', label: KIND.appointment, icon: User, description: 'Cada reservación ocupa a una persona, sala o equipo durante su duración.' },
  { value: 'session', label: KIND.session, icon: UsersRound, description: 'Clases o grupos: se apartan lugares dentro de sesiones programadas.' },
]

// Nuevo / Editar servicio as a full page. Resources can be created in place, so
// nobody discovers at the end of the form that one was missing.
export default function BookingsServiceEditor({ space, serviceId, services, resources, linkedIds, canConfigure, canManageCatalog }) {
  const isNew = serviceId === 'new'
  const service = isNew ? null : (services.data ?? []).find((s) => s.id === serviceId)
  const ready = !services.isPending && !resources.isPending && !linkedIds.isPending
  if (!canConfigure) return <NotFoundState title="Sin permiso" description="Solo los administradores del sistema crean y editan servicios." />
  if (!ready) return <LoadingState />
  if (!isNew && !service) return <NotFoundState title="Servicio no encontrado" description="Ya no existe o pertenece a otro sistema." />
  return (
    <ServiceEditorForm
      key={serviceId} space={space} service={service} resources={resources.data ?? []} linkedIds={linkedIds.data ?? []} canManageCatalog={canManageCatalog}
    />
  )
}

function ServiceEditorForm({ space, service, resources, linkedIds, canManageCatalog }) {
  const navigate = useNavigate()
  const [initial] = useState(() => (service ? serviceToForm(service) : EMPTY_SERVICE))
  const [form, setForm] = useState(initial)
  const [attempted, setAttempted] = useState(false)
  const [creatingResource, setCreatingResource] = useState(false)
  const createdId = useRef(null)
  const dirty = !sameForm(form, initial)
  const { leave, commit, dialog } = useLeaveGuard(dirty)
  const errors = attempted ? validateService(form) : {}
  const missing = validateService(form)
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const session = form.kind === 'session'
  const back = () => navigate(bookingsPath(`/spaces/${space.id}?tab=services`))

  const linked = new Set(linkedIds)
  // In this space first; enabled company resources not used here yet can be added
  // (linked to the space on save). Disabled ones only stay visible when chosen.
  const inSpace = resources.filter((r) => linked.has(r.id) && (r.enabled || form.resourceIds.includes(r.id)))
  const elsewhere = resources.filter((r) => !linked.has(r.id) && (r.enabled || form.resourceIds.includes(r.id)))
  const chosen = resources.filter((r) => form.resourceIds.includes(r.id))
  const toggle = (id, on) => setForm((f) => ({ ...f, resourceIds: on ? [...new Set([...f.resourceIds, id])] : f.resourceIds.filter((x) => x !== id) }))

  const save = useBookingsMutation(async (t, { data, resourceIds }) => {
    const toLink = resourceIds.filter((id) => !linked.has(id))
    if (toLink.length) await runly.bookings.setSpaceResources(space.id, [...linkedIds, ...toLink], t)
    const id = service?.id ?? createdId.current
    const saved = id ? await runly.bookings.updateService(id, data, t) : await runly.bookings.createService(space.id, data, t)
    // A retry after a failed resources step updates the service it already created.
    createdId.current = (saved?.data ?? saved).id
    await runly.bookings.setServiceResources(createdId.current, resourceIds, t)
    return saved
  }, { success: service ? 'Servicio guardado.' : 'Servicio creado.' })

  async function submit(event) {
    event.preventDefault()
    setAttempted(true)
    const found = validateService(form)
    if (Object.keys(found).length) {
      requestAnimationFrame(() => {
        const field = document.querySelector('form [aria-invalid="true"]')
        if (field) field.focus()
        else document.querySelector('form [role="alert"]')?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
      })
      return
    }
    const ok = await save.mutateAsync({ data: serviceToPayload(form, { editing: Boolean(service) || Boolean(createdId.current) }), resourceIds: form.resourceIds }).then(() => true).catch(() => false)
    if (ok) commit(back)
  }

  const missingLabels = [missing.name && 'nombre', needsResource(form) && missing.resources && 'un recurso'].filter(Boolean)
  const status = save.isPending ? 'Guardando…'
    : missingLabels.length ? <span>Falta: {missingLabels.join(' y ')}</span>
      : dirty ? <span className="font-medium text-[hsl(var(--foreground))]">Cambios sin guardar</span>
        : service ? 'Sin cambios' : ''
  const noEligible = !inSpace.length && !elsewhere.length

  return (
    <>
      <FormPage
        onSubmit={submit}
        onBack={() => leave(back)}
        backLabel="Servicios"
        eyebrow={`Reservaciones · ${space.name}`}
        title={service ? `Editar ${service.name}` : 'Nuevo servicio'}
        description="Lo que tus clientes pueden reservar, cuánto dura y quién lo atiende."
        aside={<ServiceSummary form={form} chosen={chosen} missing={missing} timezone={space.timezone} />}
        footer={<FormActionBar status={status} pending={save.isPending} submitLabel={service ? 'Guardar cambios' : 'Crear servicio'} onCancel={() => leave(back)} />}
      >
        <FormSection icon={ConciergeBell} title="Información" description="Cómo se llama y cómo se reserva.">
          <TextField label="Nombre" required value={form.name} onChange={set('name')} maxLength={160} error={errors.name} placeholder="Ej. Consulta general" autoComplete="off" autoFocus={!service} />
          <TextareaField label="Descripción" value={form.description} onChange={set('description')} rows={3} hint="Opcional. Se muestra a tus clientes en las páginas de reserva." />
          <div className="space-y-2">
            <p className="text-sm font-medium">Modalidad</p>
            {service ? (
              <p className="rounded-md border border-[hsl(var(--border))] px-3 py-2.5 text-sm">{KIND[service.kind]} <span className={MUTED_TEXT}>· no se puede cambiar después de crear el servicio.</span></p>
            ) : (
              <ChoiceCardGroup ariaLabel="Modalidad del servicio" columns={2} className="max-sm:grid-cols-1" options={KIND_OPTIONS} value={form.kind} onChange={(kind) => setForm((f) => ({ ...f, kind }))} />
            )}
          </div>
        </FormSection>

        <FormSection icon={Clock3} title="Duración y horarios" description="Los márgenes bloquean el recurso antes y después de cada reservación, por ejemplo para limpieza o traslado.">
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
            <NumberField label="Duración" suffix="min" icon={null} min={1} max={1440} allowDecimal={false} value={form.durationMinutes} onChange={set('durationMinutes')} error={errors.durationMinutes} />
            <NumberField label="Ofrecer un horario cada" suffix="min" icon={null} min={5} max={1440} allowDecimal={false} value={form.slotStepMinutes} onChange={set('slotStepMinutes')} error={errors.slotStepMinutes} hint="Ej. 30: 9:00, 9:30, 10:00…" />
            <NumberField label="Margen antes" suffix="min" icon={null} min={0} max={720} allowDecimal={false} value={form.bufferBeforeMinutes} onChange={set('bufferBeforeMinutes')} error={errors.bufferBeforeMinutes} />
            <NumberField label="Margen después" suffix="min" icon={null} min={0} max={720} allowDecimal={false} value={form.bufferAfterMinutes} onChange={set('bufferAfterMinutes')} error={errors.bufferAfterMinutes} />
          </div>
        </FormSection>

        <FormSection icon={Users} title={session ? 'Cupo y personas' : 'Personas'} description={session ? 'Cuántos lugares tiene cada sesión y cuántas personas aparta una reservación.' : 'Cuántas personas puede incluir una reservación.'}>
          <div className="grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
            {session ? <NumberField label="Cupo por sesión" suffix="lugares" icon={null} min={1} max={100000} allowDecimal={false} value={form.capacity} onChange={set('capacity')} error={errors.capacity} className="pr-20" hint="Se puede ajustar al programar cada sesión." /> : null}
            {session ? <div className="hidden sm:block" aria-hidden="true" /> : null}
            <NumberField label="Mínimo por reservación" suffix="pers." icon={null} min={1} max={100000} allowDecimal={false} value={form.minParty} onChange={set('minParty')} error={errors.minParty} className="pr-16" />
            <NumberField label="Máximo por reservación" suffix="pers." icon={null} min={1} max={100000} allowDecimal={false} value={form.maxParty} onChange={set('maxParty')} error={errors.maxParty} className="pr-16" />
          </div>
        </FormSection>

        <FormSection
          icon={UsersRound}
          title={session ? 'Recursos (opcional)' : 'Quién lo atiende'}
          description={session ? 'La sala o persona de cada sesión se elige al programarla. Marca aquí las habituales si quieres.' : 'Cada reservación ocupa uno de estos recursos; con varios, se asigna el que esté libre.'}
          action={canManageCatalog && !creatingResource && !noEligible ? <Button type="button" variant="outline" size="sm" onClick={() => setCreatingResource(true)}><Plus />Nuevo recurso</Button> : null}
        >
          {noEligible && !creatingResource ? (
            <div role={errors.resources ? 'alert' : undefined} className={cn('flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between', errors.resources ? 'border-[hsl(var(--destructive)/0.5)] bg-[hsl(var(--destructive)/0.06)]' : 'border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.35)]')}>
              <div className="flex gap-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium">{session ? 'Aún no hay recursos' : 'Este servicio necesita al menos un recurso'}</p>
                  <p className={MUTED_TEXT}>
                    {canManageCatalog
                      ? 'Una persona, sala o equipo que atienda las reservaciones. Puedes crearlo aquí sin perder lo que llevas capturado.'
                      : 'Pide a quien administra los recursos de Reservaciones que dé de alta uno; lo que capturaste se conserva mientras no salgas.'}
                  </p>
                </div>
              </div>
              {canManageCatalog ? <Button type="button" className="shrink-0" onClick={() => setCreatingResource(true)}><Plus />Crear primer recurso</Button> : null}
            </div>
          ) : null}

          {creatingResource ? (
            <QuickResourcePanel
              spaceId={space.id} linkedIds={linkedIds} first={noEligible}
              onCancel={() => setCreatingResource(false)}
              onCreated={(resource) => { toggle(resource.id, true); setCreatingResource(false) }}
            />
          ) : null}

          {inSpace.length ? (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">En este sistema</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {inSpace.map((r) => <ResourceOption key={r.id} resource={r} checked={form.resourceIds.includes(r.id)} onChange={(on) => toggle(r.id, on)} />)}
              </div>
            </fieldset>
          ) : null}
          {elsewhere.length ? (
            <fieldset className="space-y-2">
              <legend className="mb-0.5 text-sm font-medium">Otros recursos de la empresa</legend>
              <p className={`${MUTED_TEXT} mb-2`}>Si eliges uno, al guardar también queda disponible en este sistema.</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {elsewhere.map((r) => <ResourceOption key={r.id} resource={r} checked={form.resourceIds.includes(r.id)} onChange={(on) => toggle(r.id, on)} />)}
              </div>
            </fieldset>
          ) : null}
          {errors.resources && !noEligible ? <p role="alert" className="text-sm text-[hsl(var(--destructive))]">{errors.resources}</p> : null}
        </FormSection>

        {service ? (
          <FormSection icon={ToggleRight} title="Estado">
            <SwitchField id="bookings-service-enabled" label="Servicio activo" description="Los servicios inactivos no aceptan nuevas reservaciones; las existentes se conservan." checked={form.enabled} onChange={(enabled) => setForm((f) => ({ ...f, enabled }))} />
          </FormSection>
        ) : null}
      </FormPage>
      {dialog}
    </>
  )
}

function ResourceOption({ resource, checked, onChange }) {
  return (
    <CheckboxField
      label={resource.name}
      hint={`${RESOURCE_TYPE[resource.type] ?? 'Recurso'}${resource.enabled ? '' : ' · inactivo'}`}
      checked={checked}
      onChange={(e) => onChange(e.target.checked)}
    />
  )
}

// Live read-out of what the page will save, plus what is still missing.
function ServiceSummary({ form, chosen, missing, timezone }) {
  const blocked = blockedMinutes(form)
  const checks = [
    { ok: !missing.name, label: 'Nombre del servicio' },
    { ok: !missing.durationMinutes && !missing.slotStepMinutes, label: 'Duración e intervalo válidos' },
    ...(needsResource(form) ? [{ ok: !missing.resources, label: 'Al menos un recurso' }] : []),
  ]
  return (
    <>
      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <p className="text-xs font-medium tracking-wide text-[hsl(var(--muted-foreground))] uppercase">Resumen</p>
        <p className="mt-2 truncate text-base font-semibold">{form.name.trim() || 'Servicio sin nombre'}</p>
        <p className={MUTED_TEXT}>{KIND[form.kind]}</p>
        <dl className="mt-4 space-y-2.5 text-sm">
          <Row label="Duración">{form.durationMinutes || '—'} min</Row>
          <Row label="Ocupa el recurso">{blocked ? `${blocked} min` : '—'}</Row>
          <Row label="Horarios cada">{form.slotStepMinutes || '—'} min</Row>
          {form.kind === 'session' ? <Row label="Cupo por sesión">{form.capacity || '—'}</Row> : null}
          <Row label="Personas">{form.minParty === form.maxParty ? form.minParty : `${form.minParty}–${form.maxParty}`}</Row>
          <Row label="Recursos">{chosen.length ? chosen.length : 'Ninguno'}</Row>
        </dl>
        {chosen.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {chosen.slice(0, 6).map((r) => <StatusPill key={r.id} tone="neutral" size="sm">{r.name}</StatusPill>)}
            {chosen.length > 6 ? <StatusPill tone="neutral" size="sm">+{chosen.length - 6}</StatusPill> : null}
          </div>
        ) : null}
        <p className={`${MUTED_TEXT} mt-4`}>Horarios en {timezone}.</p>
      </div>
      <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5">
        <p className="text-xs font-medium tracking-wide text-[hsl(var(--muted-foreground))] uppercase">Antes de guardar</p>
        <ul className="mt-3 space-y-2">
          {checks.map((c) => (
            <li key={c.label} className="flex items-center gap-2 text-sm">
              {c.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden="true" /> : <Circle className="h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />}
              <span className={c.ok ? '' : 'text-[hsl(var(--muted-foreground))]'}>{c.label}</span>
              <span className="sr-only">{c.ok ? 'listo' : 'pendiente'}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  )
}

function Row({ label, children }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-[hsl(var(--muted-foreground))]">{label}</dt>
      <dd className="truncate text-right font-medium tabular-nums">{children}</dd>
    </div>
  )
}
