import { useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { cn } from '../../lib/utils.js'
import { tagText } from './template-utils.js'

// Lists the tags a kind accepts, taken from its schema (not hard-coded).
export function TemplateFieldReference({ kind }) {
  const [open, setOpen] = useState(false)
  const schema = kind?.schema ?? []
  if (!schema.length) return null
  return (
    <div className="rounded-md border border-[hsl(var(--border))]">
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 px-3 py-2.5 text-left text-sm font-medium">
        Etiquetas disponibles en la plantilla
        <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open ? (
        <div className="border-t border-[hsl(var(--border))] px-3 py-3">
          <p className="mb-3 text-xs text-[hsl(var(--muted-foreground))]">
            Escribe las etiquetas con llaves dobles en tu documento. Las imágenes usan {'{{%etiqueta}}'} y las listas repiten la fila entre sus marcas de inicio y fin.
          </p>
          <dl className="grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
            {schema.map((entry) => (
              <div key={entry.tag} className="contents">
                <dt className="break-all font-mono text-xs text-[hsl(var(--foreground))]">{tagText(entry)}</dt>
                <dd className="text-xs text-[hsl(var(--muted-foreground))]">
                  {entry.label}
                  {entry.type === 'list' && entry.fields?.length
                    ? `: ${entry.fields.map((f) => `{{${f.tag}}}`).join(', ')}`
                    : ''}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  )
}
