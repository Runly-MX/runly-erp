import { Alert, AlertDescription, Badge, Button, MarkdownViewer } from '@runly/ui'
import { Building2, CalendarClock, FileText, Hourglass, ListChecks, Repeat, ShieldCheck } from 'lucide-react'
import { ThemeToggle } from '../../../components/ThemeToggle.jsx'
import { formatInZone, formatPoints, formatTimeLimit } from '../lib/lmsAssessment.js'
import { formatsLabel } from '../lib/lmsSessionFiles.js'

const MUTED = 'text-sm text-[hsl(var(--muted-foreground))]'

export function windowText(assessment) {
  const { opensAt, closesAt, timeZone } = assessment
  if (opensAt && closesAt) return `Del ${formatInZone(opensAt, timeZone)} al ${formatInZone(closesAt, timeZone)}`
  if (opensAt) return `A partir del ${formatInZone(opensAt, timeZone)}`
  if (closesAt) return `Hasta el ${formatInZone(closesAt, timeZone)}`
  return 'Disponible ahora, sin fecha de cierre'
}

function activityLine(item) {
  const s = item.settings ?? {}
  const parts = [item.kind === 'quiz' ? 'Cuestionario' : 'Entrega']
  if (item.resourceCount) parts.push(`${item.resourceCount} ${item.resourceCount === 1 ? 'archivo de material' : 'archivos de material'}`)
  if (item.kind !== 'quiz' && s.allowFiles) parts.push(`sube ${s.acceptedTypes?.length ? formatsLabel(s.acceptedTypes) : 'archivos'} de hasta ${s.maxFileMb ?? 50} MB`)
  return parts.join(' · ')
}

function requirements(activities) {
  const files = activities.filter((item) => item.kind !== 'quiz' && item.settings?.allowFiles)
  const formats = [...new Set(files.flatMap((item) => (item.settings.acceptedTypes ?? []).map((type) => type.ext.toUpperCase())))]
  return [
    'Computadora, tableta o celular con un navegador actualizado y conexión estable.',
    files.length ? `Un programa para abrir y guardar ${formats.length ? formats.join(', ') : 'los archivos'} (por ejemplo, Excel).` : null,
    'Reserva el tiempo completo: el cronómetro no se detiene al cambiar de actividad ni al cerrar la página.',
    'Usa siempre el mismo navegador. Si cambias de equipo, continúa con un código que te enviamos por correo.',
  ].filter(Boolean)
}

function Fact({ icon: Icon, label, children }) {
  return (
    // dt/dd must be direct children of the dl group (axe definition-list); the icon lives in the dt.
    <div className="min-w-0 rounded-md bg-[hsl(var(--muted)/0.5)] px-3 py-2.5">
      <dt className="flex items-center gap-3 text-xs text-[hsl(var(--muted-foreground))]"><Icon className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" />{label}</dt>
      <dd className="pl-7 text-sm font-medium">{children}</dd>
    </div>
  )
}

// Everything a person needs to decide before registering: who organizes it,
// how long, what it contains, the window, the rules and the privacy notice.
// Never the questions, bodies or material themselves.
export function EvaluationInfo({ data, aside }) {
  const { assessment, company, settings } = data
  const total = assessment.maxPoints
  return (
    <>
      <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]">
        <div className="mx-auto w-full max-w-5xl space-y-3 px-4 pt-[max(1.5rem,var(--sat))] pb-6 sm:px-6 lg:pt-10">
          <div className="flex items-center justify-between gap-3">
            <p className="flex min-w-0 items-center gap-2 text-sm">
              {company?.logoUrl ? <img src={company.logoUrl} alt="" className="h-7 w-7 rounded-md object-contain" /> : <Building2 className="h-4 w-4 shrink-0" aria-hidden="true" />}
              <span className="truncate font-medium">{company?.name || 'Evaluación'}</span>
            </p>
            <ThemeToggle />
          </div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[hsl(var(--muted-foreground))]">Evaluación</p>
          <h1 className="text-2xl font-bold leading-tight tracking-tight sm:text-3xl">{assessment.title}</h1>
          {assessment.availability === 'upcoming' ? <Badge variant="outline">Todavía no disponible</Badge> : null}
          {assessment.availability === 'closed' ? <Badge variant="outline">Cerrada</Badge> : null}
          {/* Phones: the form is after the rules; one tap gets there. */}
          <Button asChild variant="outline" className="h-11 w-full lg:hidden"><a href="#registro">Ir al registro</a></Button>
        </div>
      </div>
      <main className="mx-auto grid w-full max-w-5xl gap-8 px-4 pt-6 pb-[max(2rem,var(--sab))] sm:px-6 sm:pt-8 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <dl className="grid gap-2 sm:grid-cols-2">
            <Fact icon={Hourglass} label="Duración">{formatTimeLimit(assessment.timeLimitMinutes)}{assessment.timeLimitMinutes ? ', un solo cronómetro' : ''}</Fact>
            <Fact icon={ListChecks} label="Actividades">{assessment.activities.length}{total !== null ? ` · ${formatPoints(total)}` : ''}</Fact>
            <Fact icon={Repeat} label="Intentos">{assessment.maxSessions === 1 ? 'Un solo intento' : `${assessment.maxSessions} intentos`}</Fact>
            <Fact icon={CalendarClock} label="Disponibilidad">{windowText(assessment)}</Fact>
          </dl>
          {assessment.availability === 'upcoming' ? <Alert><AlertDescription>El registro abre el {formatInZone(assessment.opensAt, assessment.timeZone)}.</AlertDescription></Alert> : null}
          {assessment.availability === 'closed' ? <Alert><AlertDescription>Esta evaluación ya cerró. Si te registraste, entra con tu código para ver tu confirmación.</AlertDescription></Alert> : null}
          {assessment.description ? (
            <section className="space-y-2"><h2 className="text-lg font-semibold">Instrucciones</h2><div className="rounded-md border border-[hsl(var(--border))] p-4"><MarkdownViewer value={assessment.description} /></div></section>
          ) : null}
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Qué vas a hacer</h2>
            <ol className="space-y-2">
              {assessment.activities.map((item, index) => (
                <li key={`${index}-${item.title}`} className="flex items-start gap-3 rounded-md border border-[hsl(var(--border))] px-4 py-3">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--muted))] text-sm font-semibold tabular-nums" aria-hidden="true">{index + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{item.title}</span>
                    <span className={`block ${MUTED}`}>{activityLine(item)}</span>
                  </span>
                  <span className={`${MUTED} shrink-0 tabular-nums`}>{formatPoints(item.maxPoints)}</span>
                </li>
              ))}
            </ol>
            <p className={`flex items-center gap-1.5 ${MUTED}`}><FileText className="h-4 w-4" aria-hidden="true" />El material se descarga dentro de la evaluación, una vez que la inicias.</p>
          </section>
          <section className="space-y-2">
            <h2 className="text-lg font-semibold">Requisitos</h2>
            <ul className={`list-disc space-y-1 pl-5 ${MUTED}`}>{requirements(assessment.activities).map((line) => <li key={line}>{line}</li>)}</ul>
          </section>
          <section className="space-y-2" id="aviso-privacidad">
            <h2 className="flex items-center gap-2 text-lg font-semibold"><ShieldCheck className="h-5 w-5" aria-hidden="true" />Aviso de privacidad</h2>
            <p className={`whitespace-pre-line ${MUTED}`}>
              {settings.consent.noticeText || `${company?.name || 'La empresa organizadora'} usa los datos del registro solo para administrar esta evaluación y comunicarte el resultado.`}
            </p>
          </section>
        </div>
        {/* Phones: after the information, so the rules and the notice are read first. */}
        <aside id="registro">
          <div className="rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4 lg:sticky lg:top-6">{aside}</div>
        </aside>
      </main>
    </>
  )
}
