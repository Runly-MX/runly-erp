import { Checkbox, EmptyState, ToolButton, cn } from '@runly/ui'
import { Circle, Eye, EyeOff, Image, Layers, Lock, Square, Type, Unlock, PenTool, Minus } from 'lucide-react'

export const OBJECT_META = {
  line: {label:'L?nea',icon:Minus},
  vector: { label: 'Icono', icon: PenTool },
  text: { label: 'Texto', icon: Type },
  rectangle: { label: 'Rectángulo', icon: Square },
  ellipse: { label: 'Círculo', icon: Circle },
  image: { label: 'Imagen', icon: Image },
}

const describe = object => object.type === 'text' ? (object.text.split('\n')[0].slice(0, 40) || 'Texto') : OBJECT_META[object.type].label

// Top of the list = front of the stack (the document stores back-to-front).
export function LayersPanel({ objects, selectedIds, disabled, onSelect, onToggleMany, onPatchObject }) {
  if (!objects.length) return <EmptyState variant="compact" icon={Layers} title="Añade formas, texto o imágenes para verlas aquí." />
  const selected = new Set(selectedIds)
  return (
    <ul className="space-y-1" aria-label="Capas del diseño">
      {[...objects].reverse().map(object => {
        const Icon = OBJECT_META[object.type].icon, active = selected.has(object.id)
        return (
          <li key={object.id} className={cn('group flex items-center gap-1.5 rounded-md pl-2 pr-1 transition-colors', active ? 'bg-fuchsia-500/12 text-[hsl(var(--foreground))]' : 'hover:bg-[hsl(var(--muted))]')}>
            <Checkbox aria-label={`Añadir ${describe(object)} a la selección`} disabled={disabled || object.hidden || object.locked} checked={active}
              onCheckedChange={checked => onToggleMany(checked ? [...selectedIds, object.id] : selectedIds.filter(id => id !== object.id))} />
            <button type="button" onClick={() => onSelect(object.id)} disabled={disabled}
              className={cn('flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] rounded-md px-1', object.hidden && 'opacity-50')}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className={cn('min-w-0 flex-1 truncate', active && 'font-semibold')}>{describe(object)}</span>
              {object.type === 'image' ? null : <span aria-hidden className="h-3 w-3 shrink-0 rounded-full ring-1 ring-[hsl(var(--border))]" style={{ backgroundColor: object.fill }} />}
            </button>
            <ToolButton label={object.hidden ? 'Mostrar' : 'Ocultar'} side="left" disabled={disabled} className={cn('h-9 w-9', !object.hidden && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100')}
              onClick={() => onPatchObject(object.id, { hidden: !object.hidden })}>{object.hidden ? <EyeOff /> : <Eye />}</ToolButton>
            <ToolButton label={object.locked ? 'Desbloquear' : 'Bloquear'} side="left" disabled={disabled} className={cn('h-9 w-9', !object.locked && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100')}
              onClick={() => onPatchObject(object.id, { locked: !object.locked })}>{object.locked ? <Lock /> : <Unlock />}</ToolButton>
          </li>
        )
      })}
    </ul>
  )
}
