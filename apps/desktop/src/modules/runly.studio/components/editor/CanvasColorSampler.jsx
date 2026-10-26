import { useEffect, useState } from 'react'
import { Button } from '@runly/ui'
import { Pipette } from 'lucide-react'

const hex = data => `#${[data[0], data[1], data[2]].map(value => value.toString(16).padStart(2, '0')).join('')}`

// Fallback eyedropper (no native EyeDropper): covers the design area; moving
// shows a loupe with the color under the pointer, tapping picks it. Reads
// the rendered design canvas only (selection handles live on another layer).
export function CanvasColorSampler({ canvas, onPick, onCancel }) {
  const [probe, setProbe] = useState(null)
  useEffect(() => {
    const key = event => { if (event.key === 'Escape') { event.preventDefault(); onCancel() } }
    window.addEventListener('keydown', key, true)
    return () => window.removeEventListener('keydown', key, true)
  }, [onCancel])
  function sample(event) {
    const rect = canvas?.getBoundingClientRect()
    if (!rect || event.clientX < rect.left || event.clientY < rect.top || event.clientX > rect.right || event.clientY > rect.bottom) return null
    try {
      const x = Math.floor((event.clientX - rect.left) * canvas.width / rect.width), y = Math.floor((event.clientY - rect.top) * canvas.height / rect.height)
      return hex(canvas.getContext('2d').getImageData(x, y, 1, 1).data)
    } catch { return null }
  }
  return (
    <div className="absolute inset-0 z-30 cursor-crosshair touch-none" role="application" aria-label="Cuentagotas: toca el diseño para tomar un color. Escape para cancelar."
      onPointerMove={event => { const color = sample(event); setProbe(color ? { color, x: event.nativeEvent.offsetX, y: event.nativeEvent.offsetY } : null) }}
      onPointerLeave={() => setProbe(null)}
      onPointerDown={event => { event.preventDefault(); event.stopPropagation(); const color = sample(event); if (color) onPick(color) }}>
      <div className="pointer-events-none absolute inset-x-0 top-3 flex justify-center px-2">
        <div className="glass pointer-events-auto flex items-center gap-2 rounded-full py-1 pl-3 pr-1 text-sm shadow-lg">
          <Pipette className="h-4 w-4 text-fuchsia-600" aria-hidden />Toca el diseño para tomar un color
          <Button size="sm" variant="ghost" className="h-8" onClick={event => { event.stopPropagation(); onCancel() }} onPointerDown={event => event.stopPropagation()}>Cancelar</Button>
        </div>
      </div>
      {probe ? (
        <div className="pointer-events-none absolute flex -translate-x-1/2 items-center gap-1.5 rounded-full bg-[hsl(var(--card))] py-1 pl-1 pr-2.5 shadow-lg ring-1 ring-[hsl(var(--border))]"
          style={{ left: probe.x, top: probe.y - 52 }}>
          <span className="h-8 w-8 rounded-full ring-2 ring-white" style={{ backgroundColor: probe.color }} />
          <span className="font-mono text-xs uppercase">{probe.color}</span>
        </div>
      ) : null}
    </div>
  )
}
