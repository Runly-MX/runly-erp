import { useState } from 'react'
import { cn } from '@runly/ui'
import { StudioFontPicker } from '../StudioFontPicker.jsx'

const SHAPE_COLORS = ['#d946ef', '#7c3aed', '#2563eb', '#14b8a6', '#f97316', '#1e293b']
const TILE = 'flex items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] transition-[transform,background-color,border-color] duration-150 hover:border-fuchsia-500/40 hover:bg-[hsl(var(--muted))] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none'

function Heading({ children }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{children}</p>
}

export function ElementsPanel({ disabled, onAdd }) {
  return (
    <div className="space-y-5">
      <section>
        <Heading>Formas</Heading>
        <div className="grid grid-cols-3 gap-2">
          {SHAPE_COLORS.flatMap(fill => [
            <button key={`r${fill}`} type="button" disabled={disabled} className={cn(TILE, 'aspect-square')} aria-label={`Rectángulo ${fill}`} onClick={() => onAdd('rectangle', { fill })}>
              <span className="h-1/2 w-3/5 rounded-[3px]" style={{ backgroundColor: fill }} />
            </button>,
            <button key={`e${fill}`} type="button" disabled={disabled} className={cn(TILE, 'aspect-square')} aria-label={`Círculo ${fill}`} onClick={() => onAdd('ellipse', { fill, width: 220, height: 220 })}>
              <span className="aspect-square w-1/2 rounded-full" style={{ backgroundColor: fill }} />
            </button>,
          ]).slice(0, 12)}
        </div>
      </section>
      <section>
        <Heading>Líneas y bandas</Heading>
        <div className="grid grid-cols-2 gap-2">
          {[['Línea', 480, 6], ['Banda', 640, 120]].map(([label, width, height]) => (
            <button key={label} type="button" disabled={disabled} className={cn(TILE, 'h-16 flex-col gap-1.5')} onClick={() => onAdd('rectangle', { width, height, fill: '#1e293b' })}>
              <span className="w-3/5 rounded-full bg-[hsl(var(--foreground))]" style={{ height: label === 'Línea' ? 3 : 14 }} />
              <span className="text-[11px] font-medium text-[hsl(var(--muted-foreground))]">{label}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}

const TEXT_STYLES = [
  { label: 'Añadir un título', text: 'Tu título', fontSize: 96, width: 720, className: 'text-2xl font-bold' },
  { label: 'Añadir un subtítulo', text: 'Tu subtítulo', fontSize: 56, width: 640, className: 'text-lg font-semibold' },
  { label: 'Añadir texto', text: 'Escribe aquí tu mensaje.', fontSize: 32, width: 560, className: 'text-sm' },
]

export function TextPanel({ disabled, onAdd }) {
  const [fontFamily,setFontFamily]=useState('sans-serif')
  return (
    <div className="space-y-2">
      <Heading>Estilos de texto</Heading>
      <StudioFontPicker value={fontFamily} disabled={disabled} onChange={setFontFamily}/>
      {TEXT_STYLES.map(style => (
        <button key={style.label} type="button" disabled={disabled}
          onClick={() => onAdd('text', { text: style.text, fontSize: style.fontSize, width: style.width, height: Math.ceil(style.fontSize * 1.2), fill: '#0f172a',fontFamily })}
          className={cn(TILE, 'min-h-14 w-full justify-start px-4 py-3 text-left text-[hsl(var(--foreground))]', style.className)}>
          {style.label}
        </button>
      ))}
      <p className="pt-2 text-xs text-[hsl(var(--muted-foreground))]">Doble clic sobre un texto del lienzo para escribir.</p>
    </div>
  )
}
