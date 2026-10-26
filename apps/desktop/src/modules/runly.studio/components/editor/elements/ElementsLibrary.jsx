import { useEffect, useRef, useState } from 'react'
import { SearchInput, SegmentedControl, Skeleton, cn } from '@runly/ui'
import { ChevronDown, FileUp, Shapes } from 'lucide-react'
import { scheduled } from '../../../lib/resource-queue.js'
import { BASIC_SHAPES, BLOCKS, ELEMENT_COLORS, FIGURES, FIGURE_GROUPS, LINE_BODIES, LINE_DASHES, LINE_ENDS, LINE_WEIGHTS, matches, normalizeQuery } from '../../../lib/element-library.js'
import { FramesGrid } from '../image/FramesGrid.jsx'
import { FRAMES } from '../../../lib/frame-shapes.js'

const TILE = 'group flex flex-col items-center justify-center gap-1.5 rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] p-2 text-[11px] font-medium text-[hsl(var(--muted-foreground))] transition-[transform,background-color,border-color,color] duration-150 hover:border-fuchsia-500/40 hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none'
const COMPACT = 'w-full [&_button]:min-w-0 [&_button]:px-1.5 [&_button]:py-1 [&_button]:text-xs'

function Section({ title, count, initial = 8, children, render }) {
  const [open, setOpen] = useState(false)
  if (!count) return null
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{title}</p>
        {count > initial ? (
          <button type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}
            className="flex min-h-8 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-fuchsia-700 hover:bg-fuchsia-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] dark:text-fuchsia-300">
            {open ? 'Ver menos' : `Ver todo (${count})`}<ChevronDown className={cn('h-3.5 w-3.5 transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-180')} />
          </button>
        ) : null}
      </div>
      {render ? render(open ? Infinity : initial) : children}
    </section>
  )
}

// Catalog thumbnail (transparent PNG) used as a CSS mask, tinted with the chosen color.
function FigureThumb({ id, color, loadThumbnail }) {
  const node = useRef(null), [url, setUrl] = useState(''), [failed, setFailed] = useState(false)
  useEffect(() => {
    const controller = new AbortController(); let objectUrl = '', started = false
    const observer = new IntersectionObserver(entries => {
      if (started || !entries.some(entry => entry.isIntersecting)) return
      started = true; observer.disconnect()
      scheduled(() => loadThumbnail(id, controller.signal), controller.signal)
        .then(blob => { if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setUrl(objectUrl) } })
        .catch(() => { if (!controller.signal.aborted) setFailed(true) })
    }, { rootMargin: '120px' })
    observer.observe(node.current)
    return () => { controller.abort(); observer.disconnect(); if (objectUrl) URL.revokeObjectURL(objectUrl) }
  }, [id, loadThumbnail])
  const mask = url ? { WebkitMaskImage: `url(${url})`, maskImage: `url(${url})`, WebkitMaskSize: 'contain', maskSize: 'contain', WebkitMaskRepeat: 'no-repeat', maskRepeat: 'no-repeat', WebkitMaskPosition: 'center', maskPosition: 'center' } : null
  return (
    <span ref={node} className="relative block h-9 w-9">
      {url ? <span className="absolute inset-0 transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none" style={{ ...mask, backgroundColor: color === '#ffffff' ? '#e2e8f0' : color }} />
        : failed ? <Shapes className="h-9 w-9 opacity-40" /> : <Skeleton className="h-9 w-9 rounded-lg" />}
    </span>
  )
}

function LinePreview({ body, dash, ends, color }) {
  const w = 60, h = body.key === 'spiral' ? 40 : 26, pad = 4
  const points = body.points.map(([x, y]) => `${(pad + x * (w - pad * 2)).toFixed(1)},${(pad + y * (h - pad * 2)).toFixed(1)}`).join(' ')
  const end = LINE_ENDS.find(option => option.value === ends)
  const head = (from, to) => { const a = Math.atan2(to[1] - from[1], to[0] - from[0]); return `M${to[0]} ${to[1]}L${to[0] - 7 * Math.cos(a - 0.5)} ${to[1] - 7 * Math.sin(a - 0.5)}L${to[0] - 7 * Math.cos(a + 0.5)} ${to[1] - 7 * Math.sin(a + 0.5)}Z` }
  const coords = body.points.map(([x, y]) => [pad + x * (w - pad * 2), pad + y * (h - pad * 2)])
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-full overflow-visible" aria-hidden>
      <polyline points={points} fill="none" stroke={color} strokeWidth="2" strokeLinejoin="round" strokeLinecap={dash === 'dotted' ? 'round' : 'butt'} strokeDasharray={dash === 'dashed' ? '5 3' : dash === 'dotted' ? '0.5 3.5' : undefined} />
      {end.endArrow ? <path d={head(coords.at(-2), coords.at(-1))} fill={color} /> : null}
      {end.startArrow ? <path d={head(coords[1], coords[0])} fill={color} /> : null}
    </svg>
  )
}

function BlockPreview({ block, color }) {
  const parts = block.parts(color)
  return (
    <svg viewBox={`-20 -20 ${block.width + 40} ${block.height + 40}`} className="h-12 w-full" aria-hidden>
      {parts.map((part, index) => {
        const p = part.props
        if (part.type === 'rectangle') return <rect key={index} x={p.x} y={p.y} width={p.width} height={p.height} fill={p.fill} />
        if (part.type === 'ellipse') return <ellipse key={index} cx={p.x + p.width / 2} cy={p.y + p.height / 2} rx={p.width / 2} ry={p.height / 2} fill={p.fill} />
        return p.text.split('\n').map((line, row) => (
          <text key={`${index}-${row}`} x={p.x + p.width / 2} y={p.y + p.fontSize * (row + 0.9)} textAnchor="middle" fontSize={p.fontSize} fill={p.fill === '#0f172a' ? 'currentColor' : p.fill} style={{ fontFamily: p.fontFamily }}>{line}</text>
        ))
      })}
    </svg>
  )
}

// "Elementos": searchable library with one color for new elements.
export function ElementsLibrary({ disabled, onAddPrimitive, onAddFigure, onAddLine, onAddBlock, onFrame, onImportSvg, loadThumbnail }) {
  const [search, setSearch] = useState(''), [color, setColor] = useState(ELEMENT_COLORS[0])
  const [dash, setDash] = useState('solid'), [ends, setEnds] = useState('none'), [weight, setWeight] = useState(8)
  const svgInput = useRef(null)
  const query = normalizeQuery(search)
  const basics = BASIC_SHAPES.filter(item => matches(item.label, query))
  const figures = FIGURES.filter(item => matches(item.label, query))
  const lines = LINE_BODIES.filter(item => matches(item.label, query))
  const blocks = BLOCKS.filter(item => matches(item.label, query))
  const frames = query ? FRAMES.filter(item => matches(item.label, query)) : FRAMES
  const nothing = query && !basics.length && !figures.length && !lines.length && !blocks.length && !frames.length
  return (
    <div className="space-y-5">
      <SearchInput value={search} onChange={event => setSearch(event.target.value)} onClear={() => setSearch('')} placeholder="Buscar formas, líneas, bloques…" aria-label="Buscar elementos" maxLength={60} />
      <div role="radiogroup" aria-label="Color para los nuevos elementos" className="flex flex-wrap gap-1.5">
        {ELEMENT_COLORS.map(hex => (
          <button key={hex} type="button" role="radio" aria-checked={color === hex} aria-label={`Color ${hex}`} onClick={() => setColor(hex)}
            className={cn('h-7 w-7 rounded-full border border-black/10 transition-transform hover:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] dark:border-white/20 motion-reduce:transition-none',
              color === hex && 'ring-2 ring-[hsl(var(--foreground))] ring-offset-2 ring-offset-[hsl(var(--card))]')} style={{ backgroundColor: hex }} />
        ))}
      </div>
      {nothing ? <p className="rounded-xl border border-dashed border-[hsl(var(--border))] p-4 text-center text-sm text-[hsl(var(--muted-foreground))]">Nada coincide con «{search.trim()}». Prueba en Imágenes → Iconos.</p> : null}

      <Section title="Básicas" count={basics.length} render={limit => (
        <div className="grid grid-cols-4 gap-2">
          {basics.slice(0, limit).map(item => {
            const ratio = item.width / item.height, w = ratio >= 1 ? 30 : 30 * ratio, h = ratio >= 1 ? 30 / ratio : 30
            return (
              <button key={item.key} type="button" disabled={disabled} title={item.label} aria-label={item.label} className={cn(TILE, 'aspect-square')}
                onClick={() => onAddPrimitive(item.type, { width: item.width, height: item.height, fill: color })}>
                <span className={cn('block transition-transform duration-200 group-hover:scale-110 motion-reduce:transition-none', item.type === 'ellipse' ? 'rounded-full' : 'rounded-[2px]')}
                  style={{ width: Math.max(4, w), height: Math.max(3, h), backgroundColor: color === '#ffffff' ? '#e2e8f0' : color }} />
              </button>
            )
          })}
        </div>
      )} />

      {FIGURE_GROUPS.map(group => {
        const items = figures.filter(item => item.group === group.key)
        return (
          <Section key={group.key} title={group.label} count={items.length} render={limit => (
            <div className="grid grid-cols-4 gap-2">
              {items.slice(0, limit).map(item => (
                <button key={item.id} type="button" disabled={disabled} title={item.label} aria-label={item.label} className={cn(TILE, 'aspect-square')} onClick={() => onAddFigure(item.id, color)}>
                  <FigureThumb id={item.id} color={color} loadThumbnail={loadThumbnail} />
                </button>
              ))}
            </div>
          )} />
        )
      })}

      <Section title="Líneas y flechas" count={lines.length} initial={6} render={limit => (
        <div className="space-y-2">
          <SegmentedControl ariaLabel="Trazo de la línea" options={LINE_DASHES} value={dash} onChange={setDash} className={COMPACT} />
          <SegmentedControl ariaLabel="Extremos de la línea" options={LINE_ENDS} value={ends} onChange={setEnds} className={COMPACT} />
          <SegmentedControl ariaLabel="Grosor de la línea" options={LINE_WEIGHTS} value={weight} onChange={setWeight} className={COMPACT} />
          <div className="grid grid-cols-3 gap-2 pt-1">
            {lines.slice(0, limit).map(body => {
              const end = LINE_ENDS.find(option => option.value === ends)
              return (
                <button key={body.key} type="button" disabled={disabled} className={cn(TILE, 'h-[4.5rem]')}
                  onClick={() => onAddLine({ width: body.width, height: body.height, points: body.points, strokeWidth: weight, dash, startArrow: end.startArrow, endArrow: end.endArrow, fill: color })}>
                  <LinePreview body={body} dash={dash} ends={ends} color={color === '#ffffff' ? '#94a3b8' : color} />
                  {body.label}
                </button>
              )
            })}
          </div>
        </div>
      )} />

      <Section title="Bloques combinados" count={blocks.length} initial={4} render={limit => (
        <div className="grid grid-cols-2 gap-2">
          {blocks.slice(0, limit).map(block => (
            <button key={block.key} type="button" disabled={disabled} className={cn(TILE, 'h-24 text-[hsl(var(--foreground))]')} onClick={() => onAddBlock(block, color)}>
              <BlockPreview block={block} color={color === '#ffffff' ? '#0f172a' : color} />
              <span className="text-[hsl(var(--muted-foreground))]">{block.label}</span>
            </button>
          ))}
        </div>
      )} />

      {onFrame && frames.length ? (
        <section className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Marcos para fotos</p>
          <FramesGrid nested disabled={disabled} onPick={onFrame} />
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Con una foto seleccionada se aplica al instante; si no, elige la foto después.</p>
        </section>
      ) : null}

      {onImportSvg && !query ? (
        <section className="space-y-2 rounded-xl border border-dashed border-[hsl(var(--border))] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Tus ilustraciones</p>
          <p className="text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">Importa un SVG: se convierte en formas editables y se descarta todo lo que no sea seguro. Más iconos en Imágenes → Iconos.</p>
          <button type="button" disabled={disabled} onClick={() => svgInput.current?.click()} className={cn(TILE, 'h-11 w-full flex-row gap-2 text-sm text-[hsl(var(--foreground))]')}>
            <FileUp className="h-4 w-4" aria-hidden />Importar SVG
          </button>
          <input ref={svgInput} type="file" accept=".svg,image/svg+xml" className="hidden" onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) onImportSvg(file) }} />
        </section>
      ) : null}
    </div>
  )
}
