import { useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, NumberStepper } from '@runly/ui'
import { ArrowLeftRight, ChevronDown, ClipboardCopy, ClipboardPaste, Route, Ruler, StretchHorizontal, Timer, Trash2 } from 'lucide-react'
import { copyPath, pastePath, positionPath, retimePath, reversePath, scalePath, withPositionPath } from '../../../lib/motion-path.js'

// Operations on the selected element's whole route; each is one patch (one undo step).
export function PathMenu({ target, time, slideDuration, readOnly, clipboard, onClipboard, onApply, phone }) {
  const [retiming, setRetiming] = useState(null)
  const points = target ? positionPath(target) : [], has = points.length >= 2, editable = Boolean(target) && !readOnly && !target.locked
  const apply = change => onApply(target.id, change)
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="ghost" className="h-8 shrink-0 gap-1 px-2" disabled={!target}><Route className="h-4 w-4" aria-hidden />{phone ? null : 'Trayectoria'}<ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden /><span className="sr-only">{phone ? 'Trayectoria' : ''}</span></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          <DropdownMenuItem disabled={!has || !editable} onSelect={() => apply(() => reversePath(target))}><ArrowLeftRight />Invertir recorrido</DropdownMenuItem>
          <DropdownMenuItem disabled={!has || !editable} onSelect={() => apply(() => retimePath(target, { pacing: 'distance' }))}><Ruler />Velocidad uniforme</DropdownMenuItem>
          <DropdownMenuItem disabled={!has || !editable} onSelect={() => apply(() => retimePath(target, { pacing: 'uniform' }))}><StretchHorizontal />Intervalos iguales</DropdownMenuItem>
          <DropdownMenuItem disabled={!has || !editable} onSelect={() => setRetiming({ start: points[0].at, duration: points.at(-1).at - points[0].at })}><Timer />Cambiar duración…</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!has} onSelect={() => onClipboard(copyPath(target))}><ClipboardCopy />Copiar trayectoria</DropdownMenuItem>
          <DropdownMenuItem disabled={!clipboard || !editable} onSelect={() => apply(() => pastePath(target, clipboard, time))}><ClipboardPaste />Pegar trayectoria en el cabezal</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!points.length || !editable} className="text-destructive" onSelect={() => apply(() => withPositionPath(target, []))}><Trash2 />Quitar trayectoria</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={Boolean(retiming)} onOpenChange={open => { if (!open) setRetiming(null) }}>
        <DialogContent size="md">
          <DialogHeader icon={Timer}>
            <DialogTitle>Duración del recorrido</DialogTitle>
            <DialogDescription>El recorrido conserva su forma y su ritmo; solo cambia cuánto tarda. Empieza en el mismo instante.</DialogDescription>
          </DialogHeader>
          {retiming ? (
            <div className="space-y-1">
              <p className="text-sm font-medium">Segundos</p>
              <NumberStepper label="Duración del recorrido en segundos" value={retiming.duration / 1000} min={0.1} max={Math.max(0.1, (slideDuration - retiming.start) / 1000)} step={0.5} precision={1}
                onChange={value => setRetiming({ ...retiming, duration: Math.round(value * 1000) })} className="w-48" />
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setRetiming(null)}>Cancelar</Button>
            <Button type="submit" onClick={() => {
              apply(() => scalePath(target, retiming.duration))
              setRetiming(null)
            }}>Aplicar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
