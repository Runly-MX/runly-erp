import { useState } from 'react'
import { CheckCircle2, ChevronDown, ShieldAlert, ShieldCheck } from 'lucide-react'
import { cn } from '@runly/ui'
import { STAGE_ORDER, stageMeta } from '../../lib/purchases-constants.js'

// Gated actions and the stage they must come before (mirrors the API's
// POLICY_ACTIONS + policyBlockers: an unmet requirement blocks every gated
// action whose stage comes after it).
const GATES = [
  { stage: 'PURCHASE_ORDER', label: 'la emisión de la orden' },
  { stage: 'PAYMENT', label: 'el pago' },
  { stage: 'CLOSE', label: 'el cierre del expediente' },
]
const GATE_OF = { issue: 'la emisión de la orden', pay: 'el pago', close: 'el cierre del expediente', convert: 'la conversión a orden' }

function blocksText(stage) {
  const at = STAGE_ORDER.indexOf(stage)
  const list = GATES.filter((g) => at < STAGE_ORDER.indexOf(g.stage)).map((g) => g.label)
  if (!list.length) return null
  return `Bloquea ${list.length > 1 ? `${list.slice(0, -1).join(', ')} y ${list.at(-1)}` : list[0]}.`
}

// Requirements of the company's policies. Quiet by default: a compact,
// collapsible card. It turns red only when it blocks this document's gated
// action (policyCheck.blocked), and disappears when everything is met.
export function PolicyAlerts({ policyCheck }) {
  const list = Array.isArray(policyCheck) ? policyCheck : policyCheck?.requirements ?? []
  const pending = list.filter((r) => !r.satisfied)
  const met = list.filter((r) => r.satisfied)
  const blocked = Boolean(policyCheck?.blocked)
  const [open, setOpen] = useState(blocked)
  if (!pending.length) return null
  const Icon = blocked ? ShieldAlert : ShieldCheck

  return (
    <section className={cn('rounded-2xl border p-4', blocked ? 'border-rose-500/40 bg-rose-500/[0.06]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))]')}
      aria-labelledby="policy-heading">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex w-full items-start gap-2.5 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--brand-primary)/50">
        <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', blocked ? 'text-rose-600 dark:text-rose-400' : 'text-amber-600 dark:text-amber-400')} aria-hidden />
        <span className="min-w-0 flex-1">
          <span id="policy-heading" className="block text-sm font-semibold">
            Política de compras · {pending.length === 1 ? '1 requisito pendiente' : `${pending.length} requisitos pendientes`}
          </span>
          <span className={cn('block text-xs', blocked ? 'text-rose-700 dark:text-rose-300' : 'text-[hsl(var(--muted-foreground))]')}>
            {blocked ? `Ahora bloquea ${GATE_OF[policyCheck.action] ?? 'la siguiente acción'}.` : 'No bloquea lo que este documento puede hacer ahora.'}
          </span>
        </span>
        <ChevronDown className={cn('mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform motion-reduce:transition-none', open && 'rotate-180')} aria-hidden />
      </button>
      {open ? (
        <ul className="mt-3 space-y-2 text-sm">
          {pending.map((r, i) => (
            <li key={`p${i}`}>
              <span className="font-medium">{stageMeta(r.stage).label}{r.min ? ` (mínimo ${r.min})` : ''}:</span> {r.reason}
              {blocksText(r.stage) ? <span className="block text-xs text-[hsl(var(--muted-foreground))]">{blocksText(r.stage)}</span> : null}
            </li>
          ))}
          {met.map((r, i) => (
            <li key={`m${i}`} className="flex gap-2 text-[hsl(var(--muted-foreground))]">
              <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" aria-hidden />
              <span>{stageMeta(r.stage).label}: {r.reason}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  )
}
