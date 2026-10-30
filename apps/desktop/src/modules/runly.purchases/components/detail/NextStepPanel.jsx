import { Link } from 'react-router-dom'
import { AlertTriangle, ArrowRight, CheckCircle2, Clock, Info, ShieldAlert } from 'lucide-react'
import { Button, cn } from '@runly/ui'
import { ROOT } from '../../lib/purchases-constants.js'

const TONE = {
  action: { box: 'border-2 border-(--brand-primary)/70', heading: 'text-(--brand-primary-computed)', icon: ArrowRight },
  urgent: { box: 'border-2 border-rose-500/70', heading: 'text-rose-700 dark:text-rose-300', icon: AlertTriangle },
  blocked: { box: 'border border-rose-500/40 bg-rose-500/[0.06]', heading: 'text-rose-700 dark:text-rose-300', icon: ShieldAlert },
  waiting: { box: 'border border-[hsl(var(--border))]', heading: 'text-[hsl(var(--muted-foreground))]', icon: Clock },
  done: { box: 'border border-emerald-500/40', heading: 'text-emerald-700 dark:text-emerald-300', icon: CheckCircle2 },
  info: { box: 'border border-[hsl(var(--border))]', heading: 'text-[hsl(var(--muted-foreground))]', icon: Info },
}

// lib/next-step.js rendered: what to do now, with the same action the header
// offers (shared runner) or who has to do it when the user cannot.
export function NextStepPanel({ step, actions, runner }) {
  if (!step) return null
  const tone = TONE[step.tone] ?? TONE.info
  const Icon = tone.icon
  const find = (key) => actions.find((a) => a.key === key)
  const cta = step.cta ? find(step.cta) : null
  const secondary = step.secondary ? find(step.secondary) : null
  // Same action as the header, shown disabled while the policy blocks it.
  const blockedCta = step.blockedCta ? find(step.blockedCta) : null

  return (
    <section aria-labelledby="next-step-heading" className={cn('rounded-2xl bg-[hsl(var(--card))] p-4', tone.box)} data-next-step={step.tone}>
      <h2 id="next-step-heading" className={cn('flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider', tone.heading)}>
        <Icon className="h-3.5 w-3.5" aria-hidden />Siguiente paso
      </h2>
      <p className="mt-1.5 text-base font-semibold leading-snug">{step.title}</p>
      {step.items.length ? (
        <ul className="mt-2 space-y-1 text-sm">
          {step.items.map((item) => <li key={item} className="flex gap-2"><span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-current" />{item}</li>)}
        </ul>
      ) : null}
      {step.detail ? <p className="mt-1.5 text-sm text-[hsl(var(--muted-foreground))]">{step.detail}</p> : null}
      {step.links.length ? (
        <p className="mt-2 flex flex-wrap gap-2">
          {step.links.map((link) => (
            <Link key={link.id} to={`${ROOT}/${link.kind}/${link.id}`}
              className="rounded-md bg-[hsl(var(--muted))] px-2 py-1 text-sm font-medium tabular-nums hover:bg-(--brand-primary)/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)/50">
              {link.label}
            </Link>
          ))}
        </p>
      ) : null}
      {blockedCta ? (
        <div className="mt-3">
          <Button className="min-h-11" disabled aria-describedby="next-step-heading">{blockedCta.label}</Button>
        </div>
      ) : null}
      {cta || secondary ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {cta ? <Button className="min-h-11 flex-1 sm:flex-none" disabled={runner.busy} onClick={() => runner.trigger(cta)}>{cta.label}</Button> : null}
          {secondary ? <Button variant="outline" className="min-h-11" disabled={runner.busy} onClick={() => runner.trigger(secondary)}>{secondary.label}</Button> : null}
        </div>
      ) : null}
    </section>
  )
}
