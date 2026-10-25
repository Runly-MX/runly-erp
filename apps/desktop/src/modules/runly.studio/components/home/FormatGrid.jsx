import { cn } from '@runly/ui'
import { Loader2, Plus, Ruler } from 'lucide-react'
import { formatsFor, sizeLabel } from '../../lib/formats.js'

const DOT_GRID = { backgroundImage: 'radial-gradient(hsl(var(--muted-foreground) / 0.22) 1px, transparent 1px)', backgroundSize: '14px 14px' }
const CARD = 'group flex flex-col rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-2.5 text-left transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-fuchsia-500/40 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:pointer-events-none disabled:opacity-60 motion-reduce:transition-none motion-reduce:hover:translate-y-0'

// Mini frame keeps the real aspect ratio inside a 4:3 tile.
function frameStyle({ width, height }) {
  const scale = Math.min((0.62 * 4) / width, (0.72 * 3) / height)
  return { width: `${(width * scale / 4) * 100}%`, height: `${(height * scale / 3) * 100}%` }
}

function CardFooter({ title, subtitle, busy }) {
  return (
    <div className="mt-2.5 flex items-center gap-2 px-0.5">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-[hsl(var(--foreground))]">{title}</p>
        <p className="truncate text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{subtitle}</p>
      </div>
      <span aria-hidden className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))] transition-colors group-hover:bg-fuchsia-600 group-hover:text-white">
        {busy ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Plus className="h-4 w-4" />}
      </span>
    </div>
  )
}

export function FormatGrid({ category, creating, onCreate, onCustom }) {
  const formats = formatsFor(category)
  return (
    <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
      {formats.map(format => {
        const Icon = format.icon
        return (
          <li key={format.key} className="flex">
            <button type="button" className={cn(CARD, 'w-full')} disabled={Boolean(creating)} onClick={() => onCreate(format)} aria-label={`Crear ${format.label}, ${sizeLabel(format)}`}>
              <div className="relative flex aspect-[4/3] items-center justify-center rounded-xl bg-[hsl(var(--muted)/0.5)]" style={DOT_GRID}>
                <span className={cn('flex items-center justify-center rounded-md bg-gradient-to-br text-white shadow-lg transition-transform duration-200 group-hover:scale-105 motion-reduce:transition-none', format.tone)} style={frameStyle(format)}>
                  <Icon className="h-5 w-5 drop-shadow" aria-hidden />
                </span>
                <span className="absolute right-2 top-2 rounded-full bg-[hsl(var(--card)/0.9)] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[hsl(var(--muted-foreground))] backdrop-blur">{format.ratio}</span>
              </div>
              <CardFooter title={format.label} subtitle={sizeLabel(format)} busy={creating === format.key} />
            </button>
          </li>
        )
      })}
      <li className="flex">
        <button type="button" className={cn(CARD, 'w-full border-dashed')} disabled={Boolean(creating)} onClick={onCustom}>
          <div className="flex aspect-[4/3] items-center justify-center rounded-xl border border-dashed border-[hsl(var(--border))]">
            <Ruler className="h-7 w-7 text-[hsl(var(--muted-foreground))] transition-colors group-hover:text-fuchsia-600" aria-hidden />
          </div>
          <CardFooter title="Tamaño personalizado" subtitle="De 32 a 4096 px" busy={creating === 'custom'} />
        </button>
      </li>
    </ul>
  )
}
