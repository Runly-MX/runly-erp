import { useState } from 'react'
import { ChevronDown, Code2 } from 'lucide-react'
import { FormsCodeBlock } from './FormsCopyButton.jsx'

// Collapsible "how to use it in your Astro site" snippet for a form.
export function FormsIntegrationTip({ formId, formName }) {
  const [open, setOpen] = useState(false)

  const slug = (formName ?? 'miFormulario')
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/, '')

  const configLine = `  ${slug}: '${formId}',`
  const importLine = `import { FORMS } from '../config/forms'`
  const usageLine = `<DynamicForm formId={FORMS.${slug}} client:load />`

  return (
    <div className="overflow-hidden rounded-xl border border-[hsl(var(--border))]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left text-sm transition-colors duration-150 hover:bg-[hsl(var(--muted))]/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-sky-500/12 text-sky-600 dark:text-sky-400"><Code2 className="h-4 w-4" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Cómo usarlo en tu sitio web</span>
          <span className="block text-xs text-[hsl(var(--muted-foreground))]">Dos pasos para insertarlo con DynamicForm</span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[hsl(var(--muted-foreground))] transition-transform duration-200 ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>

      {open && (
        <div className="space-y-4 border-t border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-3 md:p-4">
          <Step n={1} title={<>Agrega el ID a <code className="rounded bg-[hsl(var(--muted))] px-1 font-mono">src/config/forms.ts</code></>}>
            <FormsCodeBlock code={`export const FORMS = {\n${configLine}\n  // ... otros formularios\n}`} />
          </Step>
          <Step n={2} title="Usa el componente en tu página Astro">
            <FormsCodeBlock code={`${importLine}\n\n${usageLine}`} />
          </Step>
          <p className="text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">
            Los IDs de formulario son identificadores públicos: no van en <code className="font-mono">.env</code>.
            Todos los formularios del sitio se gestionan desde <code className="font-mono">src/config/forms.ts</code>.
          </p>
        </div>
      )}
    </div>
  )
}

function Step({ n, title, children }) {
  return (
    <div className="space-y-2">
      <p className="flex items-center gap-2 text-xs font-semibold text-[hsl(var(--foreground))]">
        <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[hsl(var(--ring))]/15 text-[11px] tabular-nums text-[hsl(var(--ring))]">{n}</span>
        <span className="min-w-0">{title}</span>
      </p>
      {children}
    </div>
  )
}
