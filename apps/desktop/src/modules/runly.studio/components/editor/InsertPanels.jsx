import { useState } from 'react'
import { cn } from '@runly/ui'
import { StudioFontPicker } from '../StudioFontPicker.jsx'
import { draggable } from '../../lib/studio-drag.js'
import { Barcode, QrCode } from 'lucide-react'
import { CODE_LABELS, codeObject } from '../../lib/studio-codes.js'

const CODES = [{ kind: 'qr', value: '{{Enlace público}}', icon: QrCode }, { kind: 'code128', value: '{{Número de activo}}', icon: Barcode }]

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
      <div className="pt-3"><Heading>Códigos y campos</Heading></div>
      <div className="grid grid-cols-2 gap-2">
        {CODES.map(({ kind, value, icon: Icon }) => (
          <button key={kind} type="button" disabled={disabled} onClick={() => onAdd('vector', codeObject(kind, value))}
            {...draggable({ kind: 'element', label: CODE_LABELS[kind], size: { width: 240, height: 240 }, insert: point => onAdd('vector', codeObject(kind, value), point) })}
            className={cn(TILE, 'min-h-16 flex-col gap-1 px-2 py-2 text-xs font-medium text-[hsl(var(--foreground))]')}>
            <Icon className="h-5 w-5" aria-hidden />{CODE_LABELS[kind]}
          </button>
        ))}
      </div>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">Escribe campos como {'{{Nombre}}'} en textos y códigos; en Descargar, «Datos para varias versiones» crea una versión por registro o fila.</p>
    </div>
  )
}
