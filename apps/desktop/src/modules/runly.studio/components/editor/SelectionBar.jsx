import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger, SliderRow, ToolButton } from '@runly/ui'
import { ArrowDown, ArrowUp, Blend, BringToFront, CopyPlus, Group, Layers2, Lock, SendToBack, SlidersHorizontal, Trash2, Ungroup, Unlock } from 'lucide-react'
import { ColorPopover } from './StudioColorPicker.jsx'
import { TextSelectionControls } from './TextSelectionControls.jsx'
import { ImageSelectionControls } from './image/ImageSelectionControls.jsx'
import { LineSelectionControls } from './LineSelectionControls.jsx'
import { ShapeSelectionControls } from './ShapeSelectionControls.jsx'
import { isShape } from '../../lib/photo-target.js'

const ORDER = [['front', 'Traer al frente', BringToFront], ['up', 'Subir un nivel', ArrowUp], ['down', 'Bajar un nivel', ArrowDown], ['back', 'Enviar al fondo', SendToBack]]

function Divider() {
  return <span aria-hidden className="mx-0.5 h-6 w-px shrink-0 bg-[hsl(var(--border))]" />
}

// Floating contextual toolbar for the current selection (Canva-style).
// `grouping` = { canGroup, canUngroup } for the current selection.
export function SelectionBar({ selection, selectedCount, disabled, onPatch, onAction, onOrder, onRemove, onProperties, imageTools, grouping }) {
  const locked = Boolean(selection?.locked), editable = disabled || locked
  return (
    <div role="toolbar" aria-label="Opciones de la selección"
      className="glass pointer-events-auto flex max-w-full flex-wrap items-center justify-center gap-0.5 rounded-2xl p-1 shadow-lg [scrollbar-width:none] max-sm:flex-nowrap max-sm:justify-start max-sm:overflow-x-auto max-sm:[&_button]:min-h-11 max-sm:[&_button]:min-w-11 max-sm:[&>*]:shrink-0">
      {selection ? (
        <>
          {selection.type === 'text' ? <TextSelectionControls selection={selection} disabled={editable} onPatch={onPatch} live={imageTools} />
            : selection.type === 'image' ? (imageTools ? <ImageSelectionControls selection={selection} disabled={editable} tools={imageTools} /> : null)
              : selection.type === 'line' ? <LineSelectionControls selection={selection} disabled={editable} onPatch={onPatch} />
              : isShape(selection) ? <ShapeSelectionControls selection={selection} disabled={editable} onPatch={onPatch} tools={imageTools} />
              : <ColorPopover value={selection.fill} disabled={editable} onChange={fill => onPatch({ fill })} />}
          {selection.type !== 'image' && imageTools ? (
            <Popover>
              <PopoverTrigger asChild><ToolButton label="Transparencia" side="bottom" disabled={editable} active={(selection.opacity ?? 1) < 1} className="shrink-0"><Blend /></ToolButton></PopoverTrigger>
              <PopoverContent align="center" className="w-64 p-3">
                <SliderRow label="Opacidad" min={0} max={100} zero={100} value={Math.round((selection.opacity ?? 1) * 100)} format={value => `${value} %`} disabled={editable}
                  onStart={imageTools.begin} onCommit={imageTools.end} onChange={value => imageTools.patch({ opacity: value / 100 })} />
              </PopoverContent>
            </Popover>
          ) : null}
          {selection.type !== 'image' || imageTools ? <Divider /> : null}
        </>
      ) : <span className="whitespace-nowrap px-2.5 text-xs font-semibold tabular-nums">{selectedCount} seleccionados</span>}
      {grouping?.canGroup ? <ToolButton label="Agrupar" shortcut="Ctrl+G" side="bottom" disabled={disabled} onClick={() => onAction('group')} className="shrink-0"><Group /></ToolButton> : null}
      {grouping?.canUngroup ? <ToolButton label="Desagrupar" shortcut="Ctrl+Shift+G" side="bottom" disabled={disabled} onClick={() => onAction('ungroup')} className="shrink-0"><Ungroup /></ToolButton> : null}
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
