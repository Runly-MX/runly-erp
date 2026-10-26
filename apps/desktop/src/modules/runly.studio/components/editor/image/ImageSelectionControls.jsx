import { useState } from 'react'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, Popover, PopoverContent, PopoverTrigger,
  SliderRow, ToolButton, Tooltip, TooltipContent, TooltipTrigger } from '@runly/ui'
import { Blend, Crop, Eraser, FlipHorizontal2, FlipVertical2, ImageUp, Loader2, Maximize2, Minimize2, MoreHorizontal, RotateCcw, Sparkles, Squircle, Sun, WandSparkles } from 'lucide-react'
import { imageProperties } from '../../../../../../../shared/studio/image-properties.js'
import { activeFrame } from '../../../lib/frame-shapes.js'
import { FramesGrid } from './FramesGrid.jsx'

// Contextual controls for a selected photo inside the floating selection bar.
export function ImageSelectionControls({ selection, disabled, tools }) {
  const props = imageProperties(selection.image ?? {})
  const [opening, setOpening] = useState(false), [framesOpen, setFramesOpen] = useState(false)
  async function edit() {
    setOpening(true)
    try { await tools.editImage() } finally { setOpening(false) }
  }
  return (
    <div role="group" aria-label="Herramientas de imagen" className="flex flex-wrap items-center justify-center gap-0.5 max-sm:flex-nowrap max-sm:[&>*]:shrink-0">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="ghost" size="sm" disabled={disabled || opening} onClick={edit} className="h-10 gap-1.5 px-2.5 font-semibold text-fuchsia-700 hover:text-fuchsia-800 sm:h-9 dark:text-fuchsia-300">
            {opening ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <WandSparkles />}<span className="max-sm:sr-only">Editar imagen</span>
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-60">Recorta, endereza, anota o aplica filtros. Se guarda una copia; el original sigue intacto en Files.</TooltipContent>
      </Tooltip>
      <ToolButton label="Recortar y encuadrar (doble clic en la foto)" side="bottom" disabled={disabled} onClick={tools.startFraming}><Crop /></ToolButton>
      <Popover open={framesOpen} onOpenChange={setFramesOpen}>
        <PopoverTrigger asChild>
          <ToolButton label="Marcos" side="bottom" disabled={disabled} active={props.mask !== 'rectangle' || props.border.width > 0}><Squircle /></ToolButton>
        </PopoverTrigger>
        <PopoverContent align="center" className="max-h-[min(70dvh,560px)] w-80 overflow-y-auto p-3">
          <FramesGrid activeKey={activeFrame(props)?.key} imageUrl={tools.imageUrl} disabled={disabled} onPick={preset => tools.frame(preset)} />
        </PopoverContent>
      </Popover>
      <ToolButton label="Ajustar luz y color" side="bottom" disabled={disabled} onClick={() => tools.openPanel('adjust')}><Sun /></ToolButton>
      <ToolButton label="Filtros" side="bottom" disabled={disabled} onClick={() => tools.openPanel('filters')}><Sparkles /></ToolButton>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><ToolButton label="Voltear" side="bottom" disabled={disabled}><FlipHorizontal2 /></ToolButton></DropdownMenuTrigger>
        <DropdownMenuContent align="center" className="min-w-48">
          <DropdownMenuItem onSelect={() => tools.image({ flipX: !props.flipX })} className="gap-2.5"><FlipHorizontal2 className="h-4 w-4" />Voltear en horizontal</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => tools.image({ flipY: !props.flipY })} className="gap-2.5"><FlipVertical2 className="h-4 w-4" />Voltear en vertical</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Popover>
        <PopoverTrigger asChild><ToolButton label="Opacidad" side="bottom" disabled={disabled}><Blend /></ToolButton></PopoverTrigger>
        <PopoverContent align="center" className="w-64 p-3">
          <SliderRow label="Opacidad" min={0} max={100} zero={100} value={Math.round((selection.opacity ?? 1) * 100)} format={value => `${value} %`} disabled={disabled}
            onStart={tools.begin} onCommit={tools.end} onChange={value => tools.patch({ opacity: value / 100 })} />
        </PopoverContent>
      </Popover>
      <DropdownMenu>
        <DropdownMenuTrigger asChild><ToolButton label="Más opciones de imagen" side="bottom" disabled={disabled}><MoreHorizontal /></ToolButton></DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel>Foto en el marco</DropdownMenuLabel>
          {props.fit === 'cover'
            ? <DropdownMenuItem onSelect={() => tools.image({ fit: 'contain' })} className="gap-2.5"><Minimize2 className="h-4 w-4" />Encajar la foto completa</DropdownMenuItem>
            : <DropdownMenuItem onSelect={() => tools.image({ fit: 'cover' })} className="gap-2.5"><Maximize2 className="h-4 w-4" />Rellenar el marco</DropdownMenuItem>}
          <DropdownMenuItem onSelect={tools.replace} className="gap-2.5"><ImageUp className="h-4 w-4" />Reemplazar foto</DropdownMenuItem>
          <DropdownMenuItem onSelect={tools.resetFraming} className="gap-2.5"><RotateCcw className="h-4 w-4" />Restablecer encuadre</DropdownMenuItem>
          <DropdownMenuItem onSelect={tools.resetAdjustments} className="gap-2.5"><Sun className="h-4 w-4" />Restablecer ajustes</DropdownMenuItem>
          {tools.removeBackground ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={tools.removeBackground} className="gap-2.5"><Eraser className="h-4 w-4" />Quitar fondo</DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
