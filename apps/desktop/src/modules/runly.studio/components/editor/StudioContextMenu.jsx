import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuLabel, ContextMenuSeparator, ContextMenuShortcut, ContextMenuSub,
  ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from '@runly/ui'
import {
  AlignCenterHorizontal, AlignCenterVertical, AlignEndHorizontal, AlignEndVertical, AlignHorizontalDistributeCenter, AlignStartHorizontal,
  AlignStartVertical, AlignVerticalDistributeCenter, ArrowDown, ArrowUp, BringToFront, ClipboardPaste, Copy, CopyPlus, EyeOff, Frame, Layers2,
  Lock, Maximize, MousePointerSquareDashed, SendToBack, SlidersHorizontal, Trash2,
} from 'lucide-react'
import { OBJECT_META } from './LayersPanel.jsx'

const ALIGN = [
  ['left', 'Izquierda', AlignStartVertical], ['center', 'Centro horizontal', AlignCenterVertical], ['right', 'Derecha', AlignEndVertical],
  ['top', 'Arriba', AlignStartHorizontal], ['middle', 'Centro vertical', AlignCenterHorizontal], ['bottom', 'Abajo', AlignEndHorizontal],
]
const DISTRIBUTE = [['distribute-x', 'Distribuir horizontalmente', AlignHorizontalDistributeCenter], ['distribute-y', 'Distribuir verticalmente', AlignVerticalDistributeCenter]]
const ORDER = [['front', 'Traer al frente', BringToFront], ['up', 'Subir un nivel', ArrowUp], ['down', 'Bajar un nivel', ArrowDown], ['back', 'Enviar al fondo', SendToBack]]
const ICON = 'h-4 w-4 text-[hsl(var(--muted-foreground))]'

function Item({ icon: Icon, label, shortcut, onSelect, disabled, destructive }) {
  return (
    <ContextMenuItem disabled={disabled} onSelect={onSelect} className={destructive ? 'gap-2.5 text-destructive focus:text-destructive' : 'gap-2.5'}>
      <Icon className={destructive ? 'h-4 w-4' : ICON} />{label}{shortcut ? <ContextMenuShortcut>{shortcut}</ContextMenuShortcut> : null}
    </ContextMenuItem>
  )
}

// Right click (or long press on touch) over the canvas. `onPick` selects what is
// under the pointer before the menu renders, so the items match the target.
export function StudioContextMenu({ children, onPick, selection, selectedCount, readOnly, disabled, canPaste, onAction, onOrder, onAlign, onPatch, onRemove,
  onSelectAll, onFit, onProperties, onPage }) {
  const multi = !selection && selectedCount > 1, has = Boolean(selection) || multi
  const editable = !readOnly && !disabled, locked = Boolean(selection?.locked)
  const alignItems = (target, list) => list.map(([direction, label, Icon]) => (
    <Item key={direction} icon={Icon} label={label} disabled={!editable || (direction.startsWith('distribute') && selectedCount < 3)} onSelect={() => onAlign(direction, target)} />
  ))
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild onContextMenu={event => onPick(event.nativeEvent)}>{children}</ContextMenuTrigger>
      <ContextMenuContent className="min-w-56">
        {has ? (
          <>
            <ContextMenuLabel className="text-xs font-semibold text-[hsl(var(--muted-foreground))]">
              {multi ? `${selectedCount} elementos` : OBJECT_META[selection.type].label}
            </ContextMenuLabel>
            <Item icon={Copy} label="Copiar" shortcut="Ctrl+C" onSelect={() => onAction('copy')} />
            <Item icon={ClipboardPaste} label="Pegar" shortcut="Ctrl+V" disabled={!editable || !canPaste} onSelect={() => onAction('paste')} />
            <Item icon={CopyPlus} label="Duplicar" shortcut="Ctrl+D" disabled={!editable} onSelect={() => onAction('duplicate')} />
            <ContextMenuSeparator />
            {selection ? (
              <ContextMenuSub>
                <ContextMenuSubTrigger disabled={!editable || locked} className="gap-2.5"><Layers2 className={ICON} />Organizar</ContextMenuSubTrigger>
                <ContextMenuSubContent className="min-w-48">
                  {ORDER.map(([key, label, Icon]) => <Item key={key} icon={Icon} label={label} onSelect={() => onOrder(key)} />)}
                </ContextMenuSubContent>
              </ContextMenuSub>
            ) : null}
            <ContextMenuSub>
              <ContextMenuSubTrigger disabled={!editable || locked} className="gap-2.5"><AlignCenterVertical className={ICON} />{multi ? 'Alinear entre sí' : 'Alinear a la página'}</ContextMenuSubTrigger>
              <ContextMenuSubContent className="min-w-52">
                {alignItems(multi ? 'selection' : 'page', ALIGN)}
                {multi ? <><ContextMenuSeparator />{alignItems('selection', DISTRIBUTE)}</> : null}
              </ContextMenuSubContent>
            </ContextMenuSub>
            {selection ? (
              <>
                <Item icon={Lock} label={locked ? 'Desbloquear' : 'Bloquear'} disabled={!editable} onSelect={() => onPatch({ locked: !locked })} />
                <Item icon={EyeOff} label="Ocultar" disabled={!editable || locked} onSelect={() => onPatch({ hidden: true })} />
              </>
            ) : null}
            {onProperties ? <Item icon={SlidersHorizontal} label="Propiedades" onSelect={onProperties} /> : null}
            <ContextMenuSeparator />
            <Item icon={Trash2} label="Eliminar" shortcut="Supr" destructive disabled={!editable || locked} onSelect={onRemove} />
          </>
        ) : (
          <>
            <Item icon={ClipboardPaste} label="Pegar" shortcut="Ctrl+V" disabled={!editable || !canPaste} onSelect={() => onAction('paste')} />
            <Item icon={MousePointerSquareDashed} label="Seleccionar todo" shortcut="Ctrl+A" disabled={disabled} onSelect={onSelectAll} />
            <ContextMenuSeparator />
            <Item icon={Maximize} label="Ajustar a la pantalla" onSelect={onFit} />
            <Item icon={Frame} label="Tamaño y fondo" disabled={readOnly} onSelect={onPage} />
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  )
}
