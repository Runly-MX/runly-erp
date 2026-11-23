import { Button, NumberStepper, SelectField, SwitchField, cn } from '@runly/ui'
import { Check, MousePointerClick, Play, Spline, Undo2, X } from 'lucide-react'

const CURVES = [{ value: 'linear', label: 'Constante' }, { value: 'ease', label: 'Suave' }, { value: 'ease-in', label: 'Acelerar' }, { value: 'ease-out', label: 'Desacelerar' }, { value: 'ease-in-out', label: 'Acelerar y frenar' }]
const PACINGS = {
  draw: [{ value: 'recorded', label: 'Como lo dibujé' }, { value: 'distance', label: 'Velocidad uniforme' }, { value: 'uniform', label: 'Intervalos iguales' }],
  points: [{ value: 'distance', label: 'Según la distancia' }, { value: 'uniform', label: 'Intervalos iguales' }],
}

// Bar of the path tools, docked in the timeline while one is active: what to do now,
// the route options (they recompute the preview, nothing is written) and Aplicar/Descartar.
export function MotionToolBar({ tool, slideDuration, phone, onPreview }) {
  const { session, result } = tool, draw = session.mode === 'draw', ready = Boolean(result?.patches)
  const hint = draw
    ? (tool.drawing ? 'Suelta para terminar el recorrido.' : ready ? 'Revisa el recorrido. Arrastra de nuevo para volver a dibujarlo.' : 'Arrastra el elemento (o desde cualquier punto) para dibujar su recorrido.')
    : (session.offsets.length > 1 ? `${session.offsets.length - 1} ${session.offsets.length === 2 ? 'punto añadido' : 'puntos añadidos'}. Sigue tocando el lienzo o aplica.` : 'Toca o haz clic en el lienzo para añadir cada posición del recorrido.')
  const Icon = draw ? Spline : MousePointerClick
  return (
    <div role="toolbar" aria-label={draw ? 'Dibujar movimiento' : 'Crear trayectoria'}
      className="shrink-0 border-b border-fuchsia-500/30 bg-fuchsia-500/[0.06] px-2 py-1.5">
      <div className="flex items-center gap-2 px-1">
        <Icon className="h-4 w-4 shrink-0 text-fuchsia-600 dark:text-fuchsia-400" aria-hidden />
        <p className="min-w-0 flex-1 text-sm"><span className="font-semibold">{draw ? 'Dibujar movimiento' : 'Crear trayectoria'}</span><span aria-live="polite" className="text-[hsl(var(--muted-foreground))]"> · {hint}</span></p>
      </div>
      {result?.error ? <p role="alert" className="px-1 pt-1 text-xs text-destructive">{result.error}</p> : null}
      <div className={cn('mt-1.5 flex items-end gap-2', phone ? 'overflow-x-auto overscroll-contain pb-1' : 'flex-wrap')}>
        {/* The route starts at the playhead by default (to chain movements); always visible and editable. */}
        <div className="w-32 shrink-0 space-y-1">
          <p className="text-[11px] font-medium text-[hsl(var(--muted-foreground))]">Inicio (s)</p>
          <NumberStepper label="Inicio del recorrido en segundos" size="sm" value={session.start / 1000} min={0} max={Math.max(0, (slideDuration - 100) / 1000)} step={0.5} precision={2}
            onChange={value => { const start = Math.round(value * 1000); tool.update({ start, duration: Math.min(session.duration, slideDuration - start) }) }} className="w-full" />
        </div>
        <div className="w-32 shrink-0 space-y-1">
          <p className="text-[11px] font-medium text-[hsl(var(--muted-foreground))]">Duración (s)</p>
          <NumberStepper label="Duración del recorrido en segundos" size="sm" value={session.duration / 1000} min={0.1} max={Math.max(0.1, (slideDuration - session.start) / 1000)} step={0.5} precision={1}
            onChange={value => tool.update({ duration: Math.round(value * 1000) })} className="w-full" />
        </div>
        <SelectField label="Ritmo" className="w-44 shrink-0" options={PACINGS[session.mode]} value={session.pacing} onValueChange={pacing => pacing && tool.update({ pacing })} />
        <SelectField label="Curva del recorrido" className="w-40 shrink-0" options={CURVES} value={session.curve} onValueChange={curve => curve && tool.update({ curve })} />
        <SwitchField label="Suavizar" className="shrink-0 pb-2" checked={session.smooth} onChange={smooth => tool.update({ smooth })} />
        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {!draw ? <Button type="button" size="sm" variant="ghost" className="gap-1" disabled={session.offsets.length < 2} onClick={tool.undoPoint}><Undo2 className="h-3.5 w-3.5" aria-hidden />Quitar último</Button> : null}
          <Button type="button" size="sm" variant="outline" className="gap-1" disabled={!ready} onClick={onPreview}><Play className="h-3.5 w-3.5" aria-hidden />Vista previa</Button>
          <Button type="button" size="sm" variant="ghost" className="gap-1" onClick={tool.cancel}><X className="h-3.5 w-3.5" aria-hidden />Descartar</Button>
          <Button type="submit" size="sm" className="gap-1" disabled={!ready} onClick={tool.apply}><Check className="h-3.5 w-3.5" aria-hidden />Aplicar</Button>
        </div>
      </div>
    </div>
  )
}
