import { Button, ProgressBar, SectionCard } from '@runly/ui'
import { ArrowRight, Check, Sparkles, X } from 'lucide-react'

// items: [{ id, label, hint, icon, done, optional, cta, action, disabled }]. The first pending
// item is the highlighted "next step"; finished ones fold into a compact line at the bottom.
export function SetupChecklist({ items, onDismiss }) {
  const pending = items.filter((item) => !item.done)
  const done = items.filter((item) => item.done)
  const pct = items.length ? Math.round((done.length / items.length) * 100) : 100
  const [next, ...rest] = pending

  return (
    <SectionCard title="Primeros pasos" icon={Sparkles} description={pending.length ? `${done.length} de ${items.length} listos` : 'Todo listo, tu sitio está completo'} action={<span className="text-sm font-semibold tabular-nums">{pct}%</span>}>
      <ProgressBar value={pct} className="mb-4 h-2" />
      {next && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-xl border border-[hsl(var(--ring))]/40 bg-[hsl(var(--ring))]/5 p-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-[hsl(var(--ring))]/15 text-[hsl(var(--ring))]"><next.icon className="h-5 w-5" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--ring))]">Siguiente paso</p>
            <p className="text-sm font-semibold">{next.label}</p>
            {next.hint && <p className="text-xs text-[hsl(var(--muted-foreground))]">{next.hint}</p>}
          </div>
          <Button size="sm" onClick={next.action} disabled={next.disabled}>{next.cta}<ArrowRight className="ml-1.5 h-3.5 w-3.5" aria-hidden /></Button>
        </div>
      )}
      <ul className="divide-y divide-[hsl(var(--border))]">
        {rest.map((item) => (
          <li key={item.id} className="flex flex-wrap items-center gap-3 py-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"><item.icon className="h-4 w-4" aria-hidden /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{item.label}{item.optional && <span className="ml-2 rounded bg-[hsl(var(--muted))] px-1.5 py-0.5 text-[10px] font-medium text-[hsl(var(--muted-foreground))]">Opcional</span>}</p>
              {item.hint && <p className="text-xs text-[hsl(var(--muted-foreground))]">{item.hint}</p>}
            </div>
            <div className="flex items-center gap-1">
              <Button size="sm" variant="outline" onClick={item.action} disabled={item.disabled}>{item.cta}</Button>
              {item.optional && <Button size="sm" variant="ghost" aria-label={`Omitir: ${item.label}`} title="No lo necesito" onClick={() => onDismiss(item.id)}><X className="h-4 w-4" aria-hidden /></Button>}
            </div>
          </li>
        ))}
      </ul>
      {done.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2 border-t border-[hsl(var(--border))] pt-3">
          {done.map((item) => (
            <li key={item.id} className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400"><Check className="h-3 w-3" aria-hidden />{item.label}</li>
          ))}
        </ul>
      )}
    </SectionCard>
  )
}
