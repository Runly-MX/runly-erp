import { FileText, ListOrdered, Send, Wand2 } from 'lucide-react'
import { FormsCopyButton } from './FormsCopyButton.jsx'

// Left rail of forms. Selected row = flat fill (no ring/glow), per Runly list identity.
export function FormsList({ forms, activeFormId, onSelect }) {
  return (
    <nav aria-label="Formularios" className="w-full md:w-64 md:shrink-0">
      <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">
        Formularios <span className="tabular-nums">({forms.length})</span>
      </p>
      <ul className="grid gap-1.5 sm:grid-cols-2 md:grid-cols-1">
        {forms.map((form) => (
          <FormsListItem key={form.id} form={form} active={activeFormId === form.id} onSelect={() => onSelect(form.id)} />
        ))}
      </ul>
    </nav>
  )
}

function FormsListItem({ form, active, onSelect }) {
  const fieldCount = form._count?.fields ?? 0
  const subCount = form._count?.submissions ?? 0
  const Icon = form.wizardMode ? Wand2 : FileText

  return (
    <li
      className={[
        'flex items-center gap-2 rounded-xl border p-1.5 transition-colors duration-150',
        active
          ? 'border-transparent bg-[hsl(var(--muted))]'
          : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted))]/50',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'true' : undefined}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg p-1.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
      >
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${form.wizardMode ? 'bg-violet-500/12 text-violet-600 dark:text-violet-400' : 'bg-sky-500/12 text-sky-600 dark:text-sky-400'}`}>
          <Icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{form.name}</span>
          <span className="mt-0.5 flex items-center gap-2.5 text-xs text-[hsl(var(--muted-foreground))]">
            <span className="inline-flex items-center gap-1" title="Campos"><ListOrdered className="h-3 w-3" aria-hidden /><span className="tabular-nums">{fieldCount}</span> campo{fieldCount !== 1 ? 's' : ''}</span>
            <span className="inline-flex items-center gap-1" title="Envíos"><Send className="h-3 w-3" aria-hidden /><span className="tabular-nums">{subCount}</span></span>
            {form.wizardMode && <span className="font-medium text-violet-600 dark:text-violet-400">Pasos</span>}
          </span>
        </span>
      </button>
      <FormsCopyButton text={form.id} label="" />
    </li>
  )
}
