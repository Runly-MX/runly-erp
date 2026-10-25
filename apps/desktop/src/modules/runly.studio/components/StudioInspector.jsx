import { Button, Input, Textarea, EmptyState } from '@runly/ui'
import { MousePointer2 } from 'lucide-react'
const LABELS = { x: 'Posición X', y: 'Posición Y', width: 'Ancho', height: 'Alto', rotation: 'Rotación', fontSize: 'Tamaño de letra' }

export function StudioInspector({ selection, onPatch, onRemove, onAction, onOrder, busy }) {
  if (!selection) return <EmptyState variant="compact" icon={MousePointer2} title="Selecciona un elemento para editarlo" />
  return <div className="space-y-4">
    <h2 className="text-sm font-semibold">Propiedades del elemento</h2>
    {selection.type === 'text' && <label className="block space-y-1 text-sm">Texto
      <Textarea aria-label="Texto del elemento" disabled={selection.locked || busy} value={selection.text} onChange={event => onPatch({ text: event.target.value })} />
    </label>}
    <div className="grid grid-cols-2 gap-3">
      {['x', 'y', 'width', ...(selection.type === 'text' ? ['fontSize'] : ['height']), 'rotation'].map(key => <label key={key} className="space-y-1 text-sm">
        {LABELS[key]}
        <Input aria-label={LABELS[key]} type="number" disabled={selection.locked || busy} value={Math.round(selection[key] * 100) / 100} onChange={event => {
          if (event.target.value !== '') onPatch({ [key]: Number(event.target.value) })
        }} />
      </label>)}
    </div>
    {selection.type !== 'image' && <label className="block space-y-1 text-sm">Color hexadecimal
      <Input aria-label="Color hexadecimal" disabled={selection.locked || busy} key={`${selection.id}-${selection.fill}`} defaultValue={selection.fill}
        onBlur={event => onPatch({ fill: event.target.value })} />
    </label>}
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy} onClick={() => onAction('duplicate')}>Duplicar</Button>
      <Button variant="outline" disabled={busy} onClick={() => onAction('copy')}>Copiar</Button>
      <Button variant="outline" disabled={busy} onClick={() => onPatch({ locked: !selection.locked })}>{selection.locked ? 'Desbloquear' : 'Bloquear'}</Button>
      <Button variant="outline" disabled={busy} onClick={() => onPatch({ hidden: !selection.hidden })}>{selection.hidden ? 'Mostrar' : 'Ocultar'}</Button>
    </div>
    <div className="grid grid-cols-2 gap-2">{[['front', 'Traer al frente'], ['back', 'Enviar atrás'], ['up', 'Subir nivel'], ['down', 'Bajar nivel']].map(([key, label]) =>
      <Button key={key} variant="outline" size="sm" disabled={selection.locked || busy} onClick={() => onOrder(key)}>{label}</Button>)}</div>
    <Button variant="outline" disabled={selection.locked || busy} onClick={onRemove}>Eliminar elemento</Button>
  </div>
}
