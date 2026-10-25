import { useMemo } from 'react'
import { Loader2, Wand2 } from 'lucide-react'
import { STUDIO_TEMPLATES, templateDocument } from '../../../../../../shared/studio/templates.js'
import { StudioThumbnail } from '../StudioThumbnail.jsx'
import { sizeLabel } from '../../lib/formats.js'

export function TemplateGrid({ creating, onUse }) {
  const templates = useMemo(() => STUDIO_TEMPLATES.map(template => ({ ...template, document: templateDocument(template.key) })), [])
  return (
    <ul className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-6">
      {templates.map(template => (
        <li key={template.key} className="flex">
          <button
            type="button" disabled={Boolean(creating)} onClick={() => onUse(template)} aria-label={`Usar plantilla ${template.name}`}
            className="group flex w-full flex-col rounded-2xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:pointer-events-none disabled:opacity-60"
          >
            <div className="relative flex aspect-[4/5] items-center justify-center overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-gradient-to-b from-[hsl(var(--muted)/0.35)] to-[hsl(var(--muted)/0.8)] p-4 transition-[box-shadow,border-color] duration-200 group-hover:border-fuchsia-500/40 group-hover:shadow-md">
              <div className="flex h-full w-full items-center justify-center transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transition-none motion-reduce:group-hover:scale-100">
                <StudioThumbnail document={template.document} frameRatio={4 / 5} />
              </div>
              <span className="absolute inset-x-3 bottom-3 flex items-center justify-center gap-1.5 rounded-full bg-[hsl(var(--foreground))] py-2 text-xs font-semibold text-[hsl(var(--background))] opacity-0 shadow-lg transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 [@media(hover:none)]:hidden">
                {creating === template.key ? <Loader2 className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" /> : <Wand2 className="h-3.5 w-3.5" />}Usar plantilla
              </span>
            </div>
            <p className="mt-2 truncate px-0.5 text-sm font-semibold text-[hsl(var(--foreground))]">{template.name}</p>
            <p className="px-0.5 text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{sizeLabel(template)}</p>
          </button>
        </li>
      ))}
    </ul>
  )
}
