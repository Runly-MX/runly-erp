import { cn } from '@runly/ui'
import { FileUp, Loader2, Ruler } from 'lucide-react'
import { STUDIO_FORMATS } from '../../lib/formats.js'

const KEYS = ['post', 'story', 'flyer', 'slides', 'card', 'label-62x29']
const SHORT = { post: 'Publicación', story: 'Historia', flyer: 'Flyer', slides: 'Presentación', card: 'Tarjeta', 'label-62x29': 'Etiqueta' }
const BUTTON = 'group flex w-[5.25rem] shrink-0 snap-start flex-col items-center gap-2 rounded-2xl p-1.5 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:pointer-events-none disabled:opacity-60 sm:w-24'
const ICON = 'flex h-14 w-14 items-center justify-center rounded-full text-white shadow-md transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:transform-none sm:h-16 sm:w-16'

// Canva-style shortcuts: one tap creates a canvas with the right size.
export function QuickCreate({ creating, onCreate, onCustom, onImport }) {
  const formats = KEYS.map(key => STUDIO_FORMATS.find(format => format.key === key)).filter(Boolean)
  const busy = Boolean(creating)
  return (
    <ul aria-label="Crear rápido" className="relative -mx-4 mt-6 flex snap-x scroll-px-4 justify-start gap-1 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:justify-center sm:px-0">
      {formats.map(format => {
        const Icon = format.icon
        return (
          <li key={format.key}>
            <button type="button" disabled={busy} onClick={() => onCreate(format)} className={BUTTON} aria-label={`Crear ${format.label}`}>
              <span className={cn(ICON, 'bg-gradient-to-br', format.tone)}>{creating === format.key ? <Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none" aria-hidden /> : <Icon className="h-6 w-6" aria-hidden />}</span>
              <span className="text-xs font-medium text-[hsl(var(--foreground))]">{SHORT[format.key]}</span>
            </button>
          </li>
        )
      })}
      <li>
        <button type="button" disabled={busy} onClick={onCustom} className={BUTTON}>
          <span className={cn(ICON, 'bg-[hsl(var(--foreground)/0.8)] text-[hsl(var(--background))]')}><Ruler className="h-6 w-6" aria-hidden /></span>
          <span className="text-xs font-medium text-[hsl(var(--foreground))]">Personalizado</span>
        </button>
      </li>
      {onImport ? (
        <li>
          <button type="button" disabled={busy} onClick={() => onImport()} className={BUTTON}>
            <span className={cn(ICON, 'border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))]')}><FileUp className="h-6 w-6" aria-hidden /></span>
            <span className="text-xs font-medium text-[hsl(var(--foreground))]">Importar</span>
          </button>
        </li>
      ) : null}
    </ul>
  )
}
