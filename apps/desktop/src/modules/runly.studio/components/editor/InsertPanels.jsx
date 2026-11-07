import { useState } from 'react'
import { cn } from '@runly/ui'
import { StudioFontPicker } from '../StudioFontPicker.jsx'
import { draggable } from '../../lib/studio-drag.js'

// Shapes, lines, blocks and frames live in elements/ElementsLibrary.jsx.
const TILE = 'select-none [-webkit-touch-callout:none] flex items-center justify-center rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] transition-[transform,background-color,border-color] duration-150 hover:border-fuchsia-500/40 hover:bg-[hsl(var(--muted))] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none'

function Heading({ children }) {
  return <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">{children}</p>
}

const TEXT_STYLES = [
  { label: 'Añadir un título', text: 'Tu título', fontSize: 96, width: 720, className: 'text-2xl' },
  { label: 'Añadir un subtítulo', text: 'Tu subtítulo', fontSize: 56, width: 640, className: 'text-lg' },
  { label: 'Añadir texto', text: 'Escribe aquí tu mensaje.', fontSize: 32, width: 560, className: 'text-sm' },
]

const textProps = (style, fontFamily) => ({ text: style.text, fontSize: style.fontSize, width: style.width, height: Math.ceil(style.fontSize * 1.2), fill: '#0f172a', fontFamily })

export function TextPanel({ disabled, onAdd }) {
  const [fontFamily,setFontFamily]=useState('sans-serif')
  return (
    <div className="space-y-2">
      <Heading>Estilos de texto</Heading>
      <StudioFontPicker value={fontFamily} disabled={disabled} onChange={setFontFamily}/>
      {TEXT_STYLES.map(style => (
        <button key={style.label} type="button" disabled={disabled}
          style={{ fontFamily, fontWeight: 400, fontStyle: 'normal', fontSynthesis: 'none' }}
          {...draggable({ kind: 'element', label: style.label, size: { width: style.width, height: Math.ceil(style.fontSize * 1.2) }, insert: point => onAdd('text', textProps(style, fontFamily), point) })}
          onClick={() => onAdd('text', textProps(style, fontFamily))}
          className={cn(TILE, 'min-h-14 w-full justify-start px-4 py-3 text-left text-[hsl(var(--foreground))]', style.className)}>
          {style.label}
        </button>
      ))}
      <p className="pt-2 text-xs text-[hsl(var(--muted-foreground))]">Doble clic sobre un texto del lienzo para escribir.</p>
    </div>
  )
}
