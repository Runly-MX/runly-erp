import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, ToolButton } from '@runly/ui'
import { ArrowDown, ArrowUp, BringToFront, CopyPlus, Layers2, Lock, SendToBack, SlidersHorizontal, Trash2, Unlock } from 'lucide-react'
import { ColorPopover } from './StudioColorPicker.jsx'
import { TextSelectionControls } from './TextSelectionControls.jsx'

const ORDER = [['front', 'Traer al frente', BringToFront], ['up', 'Subir un nivel', ArrowUp], ['down', 'Bajar un nivel', ArrowDown], ['back', 'Enviar al fondo', SendToBack]]

function Divider() {
  return <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-[hsl(var(--border))]" />
}

// Floating contextual toolbar for the current selection (Canva-style).
export function SelectionBar({ selection, selectedCount, disabled, onPatch, onAction, onOrder, onRemove, onProperties }) {
  const locked = Boolean(selection?.locked), editable = disabled || locked
  return (
    <div role="toolbar" aria-label="Opciones de la selección"
      className="glass pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-0.5 rounded-2xl p-1 shadow-lg max-sm:[&_button]:min-h-11 max-sm:[&_button]:min-w-11">
      {selection ? (
        <>
          {selection.type === 'text' ? <TextSelectionControls selection={selection} disabled={editable} onPatch={onPatch} />
            : selection.type !== 'image' ? <ColorPopover value={selection.fill} disabled={editable} onChange={fill => onPatch({ fill })} /> : null}
          {selection.type !== 'image' ? <Divider /> : null}
        </>
      ) : <span className="whitespace-nowrap px-2.5 text-xs font-semibold tabular-nums">{selectedCount} seleccionados</span>}
      <ToolButton label="Duplicar" shortcut="Ctrl+D" side="bottom" disabled={disabled} onClick={() => onAction('duplicate')} className="shrink-0"><CopyPlus /></ToolButton>
      {selection ? (
        <>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <ToolButton label="Organizar" side="bottom" disabled={editable} className="shrink-0"><Layers2 /></ToolButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="min-w-48">
              {ORDER.map(([key, label, Icon]) => <DropdownMenuItem key={key} onSelect={() => onOrder(key)} className="gap-2.5"><Icon className="h-4 w-4" />{label}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
          <ToolButton label={locked ? 'Desbloquear' : 'Bloquear'} side="bottom" active={locked} disabled={disabled} onClick={() => onPatch({ locked: !locked })} className="shrink-0">{locked ? <Lock /> : <Unlock />}</ToolButton>
        </>
      ) : null}
      <ToolButton label="Eliminar" shortcut="Supr" side="bottom" disabled={editable} onClick={onRemove} className="shrink-0 hover:bg-destructive/10 hover:text-destructive"><Trash2 /></ToolButton>
      {onProperties ? <><Divider /><ToolButton label="Propiedades" side="bottom" onClick={onProperties} className="shrink-0"><SlidersHorizontal /></ToolButton></> : null}
    </div>
  )
}
