import { Button, Input, Textarea, EmptyState } from '@runly/ui'
import { MousePointer2 } from 'lucide-react'
const LABELS = { x: 'Posición X', y: 'Posición Y', width: 'Ancho', height: 'Alto', rotation: 'Rotación', fontSize: 'Tamaño de letra' }

export function StudioInspector({ selection, onPatch, onRemove }) {
  if (!selection) return <EmptyState variant="compact" icon={MousePointer2} title="Selecciona un elemento para editarlo" />
  return <div className="space-y-4">
    <h2 className="text-sm font-semibold">Propiedades del elemento</h2>
    {selection.type === 'text' && <label className="block space-y-1 text-sm">Texto
      <Textarea aria-label="Texto del elemento" value={selection.text} onChange={event => onPatch({ text: event.target.value })} />
    </label>}
    <div className="grid grid-cols-2 gap-3">
      {['x', 'y', 'width', ...(selection.type === 'text' ? ['fontSize'] : ['height']), 'rotation'].map(key => <label key={key} className="space-y-1 text-sm">
        {LABELS[key]}
        <Input aria-label={LABELS[key]} type="number" value={Math.round(selection[key] * 100) / 100} onChange={event => {
          if (event.target.value !== '') onPatch({ [key]: Number(event.target.value) })
        }} />
      </label>)}
    </div>
    {selection.type !== 'image' && <label className="block space-y-1 text-sm">Color hexadecimal
      <Input aria-label="Color hexadecimal" key={`${selection.id}-${selection.fill}`} defaultValue={selection.fill}
        onBlur={event => onPatch({ fill: event.target.value })} />
    </label>}
    <Button variant="outline" onClick={onRemove}>Eliminar elemento</Button>
  </div>
}
