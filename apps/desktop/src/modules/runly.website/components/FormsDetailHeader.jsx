import { Button } from '@runly/ui'
import { FileText, Trash2, Wand2 } from 'lucide-react'
import { FormsCopyButton } from './FormsCopyButton.jsx'
import { FormsIntegrationTip } from './FormsIntegrationTip.jsx'

// Selected form summary: name, description, public ID with copy, integration snippet.
export function FormsDetailHeader({ form, onDelete }) {
  const Icon = form.wizardMode ? Wand2 : FileText
  return (
    <section className="space-y-3 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-4">
      <div className="flex items-start gap-3">
        <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${form.wizardMode ? 'bg-violet-500/12 text-violet-600 dark:text-violet-400' : 'bg-sky-500/12 text-sky-600 dark:text-sky-400'}`}>
          <Icon className="h-5 w-5" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold tracking-tight">{form.name}</h2>
          {form.description
            ? <p className="mt-0.5 line-clamp-2 text-sm text-[hsl(var(--muted-foreground))]">{form.description}</p>
            : <p className="mt-0.5 text-sm text-[hsl(var(--muted-foreground))]">{form.wizardMode ? 'Formulario paso a paso' : 'Formulario de una sola página'}</p>}
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onDelete}
          className="min-h-11 shrink-0 text-[hsl(var(--destructive))] hover:bg-[hsl(var(--destructive))]/10 hover:text-[hsl(var(--destructive))] sm:min-h-0"
        >
          <Trash2 className="h-4 w-4 sm:mr-1.5" aria-hidden /><span className="sr-only sm:not-sr-only">Eliminar</span>
        </Button>
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40 py-1.5 pl-3 pr-1.5">
        <span className="shrink-0 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">ID</span>
        <code className="min-w-0 flex-1 truncate font-mono text-xs select-all" title={form.id}>{form.id}</code>
        <FormsCopyButton text={form.id} label="Copiar ID" />
      </div>

      <FormsIntegrationTip formId={form.id} formName={form.name} />
    </section>
  )
}
