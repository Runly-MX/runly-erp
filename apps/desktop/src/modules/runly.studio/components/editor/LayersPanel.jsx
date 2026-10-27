import { Checkbox, EmptyState, ToolButton, cn, personInitials } from '@runly/ui'
import { useState } from 'react'
import { ChevronDown, ChevronRight, Circle, Eye, EyeOff, Group, Image, Layers, Lock, Square, Type, Unlock, PenTool, Minus } from 'lucide-react'

export const OBJECT_META = {
  line: {label:'Línea',icon:Minus},
  vector: { label: 'Icono', icon: PenTool },
  text: { label: 'Texto', icon: Type },
  rectangle: { label: 'Rectángulo', icon: Square },
  ellipse: { label: 'Círculo', icon: Circle },
  image: { label: 'Imagen', icon: Image },
}

const describe = object => object.type === 'text' ? (object.text.split('\n')[0].slice(0, 40) || 'Texto') : OBJECT_META[object.type].label

// Top of the list = front of the stack (the document stores back-to-front).
// Grouped elements get a "Grupo" header (selects the whole group) and indent.
export function LayersPanel({ objects, selectedIds, remoteSelections = new Map(), disabled, onSelect, onSelectGroup, onToggleMany, onPatchObject }) {
  const [collapsed, setCollapsed] = useState(() => new Set())
  if (!objects.length) return <EmptyState variant="compact" icon={Layers} title="Añade formas, texto o imágenes para verlas aquí." />
  const toggleGroup = groupId => setCollapsed(current => { const next = new Set(current); next.has(groupId) ? next.delete(groupId) : next.add(groupId); return next })
  const selected = new Set(selectedIds)
  const counts = objects.reduce((map, object) => object.groupId ? map.set(object.groupId, (map.get(object.groupId) ?? 0) + 1) : map, new Map())
  const groupNumber = new Map([...counts.keys()].map((id, index) => [id, index + 1]))
  const headed = new Set()
  return (
    <ul className="space-y-1" aria-label="Capas del diseño">
      {[...objects].reverse().flatMap(object => {
        const Icon = OBJECT_META[object.type].icon, active = selected.has(object.id), others = remoteSelections.get(object.id) ?? []
        const header = object.groupId && !headed.has(object.groupId) ? (headed.add(object.groupId), (
          <li key={`group-${object.groupId}`} className="flex items-center gap-1">
            <button type="button" aria-expanded={!collapsed.has(object.groupId)} aria-label={collapsed.has(object.groupId) ? 'Expandir grupo' : 'Contraer grupo'} onClick={() => toggleGroup(object.groupId)}
              className="flex h-9 w-7 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
              {collapsed.has(object.groupId) ? <ChevronRight className="h-4 w-4" aria-hidden /> : <ChevronDown className="h-4 w-4" aria-hidden />}
            </button>
            <button type="button" disabled={disabled || !onSelectGroup} onClick={() => onSelectGroup?.(object.groupId)}
              className="flex min-h-9 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
              <Group className="h-3.5 w-3.5" aria-hidden />Grupo {groupNumber.get(object.groupId)}<span className="font-normal normal-case tracking-normal">· {counts.get(object.groupId)} elementos</span>
            </button>
          </li>
        )) : null
        if (object.groupId && collapsed.has(object.groupId)) return [header].filter(Boolean)
        return [header, (
          <li key={object.id} className={cn('group flex items-center gap-1.5 rounded-md pl-2 pr-1 transition-colors', object.groupId && 'ml-3 border-l border-[hsl(var(--border))] pl-2.5', active ? 'bg-fuchsia-500/12 text-[hsl(var(--foreground))]' : 'hover:bg-[hsl(var(--muted))]')}>
            <Checkbox aria-label={`Añadir ${describe(object)} a la selección`} disabled={disabled || object.hidden || object.locked} checked={active}
              onCheckedChange={checked => onToggleMany(checked ? [...selectedIds, object.id] : selectedIds.filter(id => id !== object.id))} />
            <button type="button" onClick={() => onSelect(object.id)} disabled={disabled}
              className={cn('flex min-h-10 min-w-0 flex-1 items-center gap-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] rounded-md px-1', object.hidden && 'opacity-50')}>
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[hsl(var(--border))] text-[hsl(var(--muted-foreground))]">
                <Icon className="h-3.5 w-3.5" />
              </span>
              <span className={cn('min-w-0 flex-1 truncate', active && 'font-semibold')}>{describe(object)}</span>
              {others.length ? <span className="flex shrink-0 items-center gap-0.5" title={`Seleccionado por ${others.map(person => person.name).join(', ')}`}>
                {others.slice(0, 3).map(person => <span key={person.userId} aria-hidden className="-ml-1 flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold leading-none text-white ring-1 ring-[hsl(var(--card))] first:ml-0" style={{ backgroundColor: person.color }}>{person.isSelf ? 'Tú' : personInitials(person.name)}</span>)}
                <span className="sr-only">Seleccionado por {others.map(person => person.name).join(', ')}</span>
              </span> : null}
              {object.type === 'image' ? null : <span aria-hidden className="h-3 w-3 shrink-0 rounded-full ring-1 ring-[hsl(var(--border))]" style={{ backgroundColor: object.fill }} />}
            </button>
            <ToolButton label={object.hidden ? 'Mostrar' : 'Ocultar'} side="left" disabled={disabled} className={cn('h-9 w-9', !object.hidden && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100')}
              onClick={() => onPatchObject(object.id, { hidden: !object.hidden })}>{object.hidden ? <EyeOff /> : <Eye />}</ToolButton>
            <ToolButton label={object.locked ? 'Desbloquear' : 'Bloquear'} side="left" disabled={disabled} className={cn('h-9 w-9', !object.locked && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100')}
              onClick={() => onPatchObject(object.id, { locked: !object.locked })}>{object.locked ? <Lock /> : <Unlock />}</ToolButton>
          </li>
        )].filter(Boolean)
      })}
    </ul>
  )
}
