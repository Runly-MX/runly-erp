import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Alert, AlertDescription, Button, CheckboxField, EmptyState, NumberField, SelectField, Skeleton, TextField, TextareaField } from '@runly/ui'
import { AlertTriangle, CalendarCheck, CalendarX2, CheckCircle2, ChevronLeft, Clock3, ExternalLink, Loader2, RotateCcw, ShieldAlert } from 'lucide-react'
import { addDays, dayKey, formatDateTime, formatTime } from '../lib/bookingsTime.js'
import { AddToCalendar, Card, LocationLines, MeetingJoin, PoliciesList, PortalHeader, SlotChooser, SummaryRows } from './PortalParts.jsx'
import { accentStyle, embedState, isNetworkError, portalApi, portalError, unwrap, useAttemptKey, useReportHeight } from './portalLib.js'

const STEPS = ['service', 'slot', 'details', 'review']
const STEP_LABEL = { service: 'Servicio', slot: 'Fecha y hora', details: 'Tus datos', review: 'Confirmar' }
const DEFAULT_PRIVACY = 'Usamos tus datos únicamente para gestionar esta reservación y comunicarnos contigo sobre ella.'
const ANY = 'any'

// Customer flow: service -> date and time (from the engine) -> details -> review
// -> result. Nothing here decides availability; the server confirms or refuses.
export default function PublicBookingScreen() {
  const { slug } = useParams()
  const [params] = useSearchParams()
  const vista = params.get('vista')
  const client = useQueryClient()
  const page = useQuery({ queryKey: ['bookings-portal', slug, vista], queryFn: async () => unwrap(await portalApi.getPage(slug, vista)), retry: false })
  const [step, setStep] = useState('service')
  const [serviceId, setServiceId] = useState(null)
  const [resourceId, setResourceId] = useState(ANY)
  const [slot, setSlot] = useState(null)
  const [form, setForm] = useState({ guestName: '', guestEmail: '', guestPhone: '', partySize: '1', notes: '', accepted: false })
  const [errors, setErrors] = useState({})
  const [submit, setSubmit] = useState({ state: 'idle' })
  const [keyFor, newAttempt] = useAttemptKey()
  const p = page.data
  const service = p?.services.find((s) => s.id === serviceId)
  const embed = params.get('embed') === '1'
  const frame = useMemo(() => embedState(p?.embed?.allowedOrigins), [p])

  useEffect(() => {
    if (!p || serviceId) return
    const wanted = params.get('servicio')
    const initial = p.services.find((s) => s.id === wanted) ?? (p.services.length === 1 ? p.services[0] : null)
    if (initial) { setServiceId(initial.id); setStep('slot') }
  }, [p]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { window.scrollTo?.({ top: 0 }) }, [step])

  if (page.isPending) return <Shell embed={embed}><Skeleton className="h-16 w-2/3" /><Skeleton className="h-64 w-full" /></Shell>
  if (page.isError) {
    return <Shell embed={embed}><EmptyState icon={CalendarX2} title="Página no disponible" description={portalError(page.error)} action={isNetworkError(page.error) ? <Button type="button" onClick={() => page.refetch()}>Reintentar</Button> : null} /></Shell>
  }
  if (frame.blocked) {
    return (
      <Shell embed={embed}>
        <EmptyState icon={ShieldAlert} title="Sitio no autorizado" description="Este sitio no está autorizado para mostrar estas reservaciones. Puedes reservar directamente en la página del negocio."
          action={<Button asChild><a href={`/app/p/reservar/${slug}`} target="_blank" rel="noopener noreferrer"><ExternalLink />Abrir reservaciones</a></Button>} />
      </Shell>
    )
  }
  const tz = p.space.timezone
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const maxDay = addDays(dayKey(new Date(), tz), p.policies.horizonDays)

  function validateDetails() {
    const next = {}
    if (form.guestName.trim().length < 2) next.guestName = 'Escribe tu nombre.'
    if (!/^\S+@\S+\.\S+$/.test(form.guestEmail.trim())) next.guestEmail = 'Revisa tu correo.'
    if (p.requirePhone && !form.guestPhone.trim()) next.guestPhone = 'Escribe tu teléfono.'
    if (form.guestPhone && !/^[0-9+()\-.\s]{7,40}$/.test(form.guestPhone.trim())) next.guestPhone = 'Revisa el teléfono.'
    const party = Number.parseInt(form.partySize, 10)
    if (!(party >= service.minParty && party <= service.maxParty)) next.partySize = `Entre ${service.minParty} y ${service.maxParty} personas.`
    setErrors(next)
    return !Object.keys(next).length
  }

  const payload = () => ({
    serviceId: service.id, ...(slot.sessionId ? { sessionId: slot.sessionId } : { startsAt: slot.startsAt, ...(resourceId !== ANY ? { resourceId } : {}) }),
    partySize: Number.parseInt(form.partySize, 10), guestName: form.guestName.trim(), guestEmail: form.guestEmail.trim(),
    guestPhone: form.guestPhone.trim() || null, notes: form.notes.trim() || null, acceptedPolicyVersion: p.policies.version,
  })

  async function confirm() {
    if (!form.accepted) { setErrors({ accepted: 'Acepta las políticas y el aviso de privacidad para continuar.' }); return }
    const data = payload()
    setSubmit({ state: 'sending' })
    try {
      const res = await portalApi.create(slug, data, keyFor(data))
      setSubmit({ state: 'done', booking: res.data, token: res.manageToken })
      setStep('result')
    } catch (error) {
      if (error?.code === 'SLOT_TAKEN' || error?.code === 'SESSION_FULL' || error?.code === 'OUTSIDE_HOURS' || error?.code === 'TOO_SOON') {
        setSlot(null); newAttempt(); client.invalidateQueries({ queryKey: ['bookings-portal-slots'] })
        setSubmit({ state: 'conflict', message: portalError(error) }); setStep('slot')
      } else if (error?.code === 'POLICY_CHANGED') {
        setForm((f) => ({ ...f, accepted: false })); await page.refetch(); setSubmit({ state: 'error', message: portalError(error), retry: false })
      } else {
        setSubmit({ state: 'error', message: portalError(error), retry: isNetworkError(error) || error?.status >= 500 || error?.code === 'CONFLICT_RETRY' })
      }
    }
  }

  return (
    <Shell accent={p.accentColor} embed={embed}>
      <PortalHeader company={p.company} title={p.title} subtitle={p.space.name} />
      {p.preview ? <Alert><AlertTriangle className="h-4 w-4" /><AlertDescription>Vista previa: la página no está publicada y no acepta reservaciones.</AlertDescription></Alert> : null}
      {step !== 'result' ? <StepIndicator step={step} skipService={p.services.length === 1} /> : null}

      {step === 'service' ? (
        <div className="space-y-4">
          {p.description ? <p className="whitespace-pre-wrap text-sm">{p.description}</p> : null}
          <LocationLines location={p.location} instructions={p.instructions} />
          {p.services.length ? (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {p.services.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => { setServiceId(s.id); setSlot(null); setResourceId(ANY); setStep('slot') }}
                    className="flex h-full min-h-20 w-full flex-col items-start gap-1 rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 text-left hover:border-(--brand-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
                    <span className="font-semibold">{s.name}</span>
                    <span className="flex items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]"><Clock3 className="h-3.5 w-3.5" aria-hidden="true" />{s.durationMinutes} min · {s.kind === 'session' ? 'Sesión grupal' : 'Cita individual'}</span>
                    {s.description ? <span className="text-sm text-[hsl(var(--muted-foreground))]">{s.description}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : <EmptyState icon={CalendarX2} title="Sin servicios disponibles" description="Por ahora no hay servicios para reservar en línea." />}
        </div>
      ) : null}

      {step === 'slot' && service ? (
        <Card className="space-y-4">
          <StepTitle onBack={p.services.length > 1 ? () => setStep('service') : null}>{service.name} · {service.durationMinutes} min</StepTitle>
          {submit.state === 'conflict' ? <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{submit.message}</AlertDescription></Alert> : null}
          {p.allowResourceChoice && service.resources?.length > 1 ? (
            <SelectField label="Profesional" options={[{ value: ANY, label: 'Cualquiera disponible' }, ...service.resources.map((r) => ({ value: r.id, label: r.name }))]} value={resourceId}
              onValueChange={(v) => { setResourceId(v); setSlot(null) }} />
          ) : null}
          <SlotChooser
            timezone={tz} maxDay={maxDay} value={slot} onChange={setSlot}
            queryKey={['bookings-portal-slots', slug, service.id, resourceId, vista]}
            fetchWeek={(from, to) => portalApi.availability(slug, { serviceId: service.id, from, to, ...(resourceId !== ANY ? { resourceId } : {}), ...(vista ? { vista } : {}) })}
          />
          <div className="flex justify-end"><Button type="button" disabled={!slot} onClick={() => { setSubmit({ state: 'idle' }); setStep('details') }}>Continuar</Button></div>
        </Card>
      ) : null}

      {step === 'details' && service ? (
        <Card className="space-y-4">
          <StepTitle onBack={() => setStep('slot')}>Tus datos</StepTitle>
          <form className="space-y-4" noValidate onSubmit={(e) => { e.preventDefault(); if (validateDetails()) setStep('review') }}>
            <TextField label="Nombre" required value={form.guestName} onChange={set('guestName')} error={errors.guestName} autoComplete="name" maxLength={160} />
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <TextField label="Correo electrónico" type="email" required value={form.guestEmail} onChange={set('guestEmail')} error={errors.guestEmail} autoComplete="email" inputMode="email" hint="Aquí te enviaremos la confirmación y el enlace para gestionar tu reservación." />
              <TextField label={p.requirePhone ? 'Teléfono' : 'Teléfono (opcional)'} type="tel" required={p.requirePhone} value={form.guestPhone} onChange={set('guestPhone')} error={errors.guestPhone} autoComplete="tel" inputMode="tel" maxLength={40} />
            </div>
            {service.maxParty > 1 ? <NumberField label="Personas" icon={null} min={service.minParty} max={service.maxParty} allowDecimal={false} value={form.partySize} onChange={set('partySize')} error={errors.partySize} hint={`De ${service.minParty} a ${service.maxParty}.`} className="sm:max-w-xs" /> : null}
            <TextareaField label="Comentarios para el negocio (opcional)" value={form.notes} onChange={set('notes')} rows={3} maxLength={500} hint="No incluyas información médica ni otros datos sensibles." />
            <div className="flex justify-end"><Button type="submit">Revisar</Button></div>
          </form>
        </Card>
      ) : null}

      {step === 'review' && service ? (
        <Card className="space-y-5">
          <StepTitle onBack={() => setStep('details')}>Revisa y confirma</StepTitle>
          <SummaryRows rows={[
            ['Servicio', service.name], ['Fecha', formatDateTime(slot.startsAt, tz).split(',').slice(0, -1).join(',')],
            ['Hora', `${formatTime(slot.startsAt, tz)} (${tz})`], ['Duración', `${service.durationMinutes} min`],
            ['Profesional', resourceId !== ANY ? service.resources?.find((r) => r.id === resourceId)?.name : null],
            ['Personas', form.partySize !== '1' ? form.partySize : null], ['Nombre', form.guestName], ['Correo', form.guestEmail], ['Teléfono', form.guestPhone],
          ]} />
          <LocationLines location={p.location} instructions={p.instructions} />
          <div className="space-y-2"><h2 className="text-sm font-semibold">Políticas</h2><PoliciesList policies={p.policies} /></div>
          <div className="space-y-2"><h2 className="text-sm font-semibold">Aviso de privacidad</h2><p className="whitespace-pre-wrap text-sm text-[hsl(var(--muted-foreground))]">{p.policies.privacyNotice || DEFAULT_PRIVACY}</p></div>
          <CheckboxField label="Acepto las políticas de reservación y el aviso de privacidad." checked={form.accepted} onChange={(e) => { setForm((f) => ({ ...f, accepted: e.target.checked })); setErrors({}) }} error={errors.accepted} />
          {submit.state === 'error' ? (
            <Alert variant="destructive"><AlertTriangle className="h-4 w-4" /><AlertDescription>{submit.message}</AlertDescription></Alert>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" onClick={confirm} disabled={!p.bookable || submit.state === 'sending'}>
              {submit.state === 'sending' ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : submit.state === 'error' && submit.retry ? <RotateCcw /> : <CalendarCheck />}
              {submit.state === 'sending' ? 'Reservando…' : submit.state === 'error' && submit.retry ? 'Reintentar' : p.policies.requiresApproval ? 'Enviar solicitud' : 'Confirmar reservación'}
            </Button>
          </div>
        </Card>
      ) : null}

      {step === 'result' && submit.booking ? <Result booking={submit.booking} token={submit.token} page={p} framed={frame.framed} onAgain={() => { newAttempt(); setSlot(null); setSubmit({ state: 'idle' }); setForm((f) => ({ ...f, accepted: false })); setStep(p.services.length > 1 ? 'service' : 'slot') }} /> : null}
    </Shell>
  )
}

function Result({ booking, token, page, framed, onAgain }) {
  const tz = booking.timezone
  const pending = booking.status === 'PENDING'
  return (
    <Card className="space-y-5" aria-live="polite">
      <div className="flex items-start gap-3">
        {pending ? <Clock3 className="h-8 w-8 shrink-0 text-amber-600" aria-hidden="true" /> : <CheckCircle2 className="h-8 w-8 shrink-0 text-emerald-600" aria-hidden="true" />}
        <div>
          <h2 className="text-lg font-semibold">{pending ? 'Solicitud recibida: pendiente de confirmación' : 'Reservación confirmada'}</h2>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">{pending ? 'El negocio debe aprobarla. Todavía no es una cita confirmada; te avisaremos por correo.' : 'Te esperamos. Te enviaremos un correo con los detalles.'}</p>
        </div>
      </div>
      <SummaryRows rows={[
        ['Folio', booking.reference], ['Servicio', booking.service?.name], ['Fecha y hora', `${formatDateTime(booking.startsAt, tz)} (${tz})`],
        ['Profesional', booking.resourceNames?.join(', ')], ['Nombre', booking.guestName], ['Correo', booking.guestEmail],
      ]} />
      {booking.meeting ? <MeetingJoin meeting={booking.meeting} /> : <LocationLines location={page.location} instructions={page.instructions} />}
      <AddToCalendar calendar={booking.calendar} />
      <div className="flex flex-wrap gap-2">
        {/* Manage links are never framed: from an embed they open in a new tab. */}
        <Button asChild>{framed
          ? <a href={`/app/p/reservar/gestion#${token}`} target="_blank" rel="noopener noreferrer">Ver o gestionar mi reservación<ExternalLink /></a>
          : <Link to={`/app/p/reservar/gestion#${token}`}>Ver o gestionar mi reservación</Link>}</Button>
        <Button type="button" variant="outline" onClick={onAgain}>Hacer otra reservación</Button>
      </div>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">Guarda el enlace de gestión: es personal y te permite consultar, reprogramar o cancelar sin crear una cuenta.</p>
    </Card>
  )
}

function StepIndicator({ step, skipService }) {
  const steps = skipService ? STEPS.slice(1) : STEPS
  const index = steps.indexOf(step)
  return (
    <ol className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label="Pasos">
      {steps.map((s, i) => (
        <li key={s} aria-current={s === step ? 'step' : undefined} className={i <= index ? 'font-semibold text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]'}>{i + 1}. {STEP_LABEL[s]}</li>
      ))}
    </ol>
  )
}

function StepTitle({ children, onBack }) {
  return (
    <div className="flex items-center gap-2">
      {onBack ? <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label="Volver" onClick={onBack}><ChevronLeft /></Button> : null}
      <h2 className="text-base font-semibold">{children}</h2>
    </div>
  )
}

// embed: tighter spacing inside an iframe, and the content height is reported to the host page.
export function Shell({ children, accent, embed = false }) {
  const style = useMemo(() => accentStyle(accent), [accent])
  const ref = useRef(null)
  useReportHeight(embed, ref)
  return <main ref={ref} className={`mx-auto flex w-full max-w-3xl min-w-0 flex-col gap-5 px-4 ${embed ? 'py-4' : 'py-6 sm:py-10'}`} style={style}>{children}</main>
}
