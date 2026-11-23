import { useEffect, useRef, useState } from 'react'
import { Button, SegmentedControl, ToolButton, cn } from '@runly/ui'
import { ChevronsDownUp, ChevronsUpDown, Diamond, Focus, Magnet, MousePointerClick, Pause, Play, RotateCcw, SkipBack, SkipForward, Spline, StretchHorizontal, X, ZoomIn, ZoomOut } from 'lucide-react'
import { captureKeyframe, moveKeyframe, neighborKeyframe, pasteKeyframe, removeKeyframe, updateKeyframe } from '../../../../../../../shared/studio/keyframes.js'
import { ZOOM_LIMITS, fitZoom, formatClock } from '../../../lib/timeline-math.js'
import { TimelineTracks } from './TimelineTracks.jsx'
import { duplicatePathPoint } from '../../../lib/motion-path.js'
import { objectLabels } from '../LayersPanel.jsx'
import { KeyframeInspector } from './KeyframeInspector.jsx'
import { PathMenu } from './PathMenu.jsx'

const MODES = [{ value: 'design', label: 'Diseño' }, { value: 'animation', label: 'Animación' }]

// Timeline under the canvas: a view over the page's animation fields. Moving the playhead,
// zooming or playing never writes; every edit is one editor patch (one undo step).
export function TimelinePanel({ timeline: t, tool, toolBar, focus, objects, selectedIds, phone, onSelect, onSelectGroup, onOpenEffect, onError }) {
  const scroll = useRef(null), labelWidth = phone ? 120 : 184
  const [pathClipboard, setPathClipboard] = useState(null)
  const zoom = t.zoom ?? fitZoom(t.duration, (scroll.current?.clientWidth ?? 800) - labelWidth)
  useEffect(() => { if (t.zoom === null && scroll.current) t.setZoom(fitZoom(t.duration, scroll.current.clientWidth - labelWidth)) }, [t.zoom, t.duration, labelWidth]) // eslint-disable-line react-hooks/exhaustive-deps
  const target = objects.find(object => object.id === selectedIds[0]) ?? null, labels = objectLabels(objects)
  const keyframeObject = t.selectedKeyframe ? objects.find(object => object.id === t.selectedKeyframe.id) : null
  const editable = !t.readOnly && target && !target.locked
  const options = { slideDuration: t.duration }
  // Model errors (occupied instant, 32 keyframes) are shown and nothing is written.
  const run = (id, change) => { let patch; try { patch = change() } catch (error) { onError(error.message); return undefined } return t.commit(id, patch) }

  const addKeyframe = () => { if (!editable) return; t.setSelectedKeyframe({ id: target.id, at: t.time }); run(target.id, () => ({ keyframes: captureKeyframe(target, t.time, options) })) }
  const removeSelected = () => {
    if (!keyframeObject || t.readOnly) return
    run(keyframeObject.id, () => ({ keyframes: removeKeyframe(keyframeObject, t.selectedKeyframe.at) })); t.setSelectedKeyframe(null)
  }
  const jump = direction => {
    const object = keyframeObject ?? target
    const at = object ? neighborKeyframe(object, t.time, direction) : null
    if (at === null) return
    t.setTime(at); t.setSelectedKeyframe({ id: object.id, at })
  }
  // A keyframe moved in time stays selected (its identity is its instant).
  const commitTrack = (id, patch, moved) => {
    if (moved && t.selectedKeyframe?.id === id && t.selectedKeyframe.at === moved.from) t.setSelectedKeyframe({ id, at: moved.to })
    return t.commit(id, patch)
  }
  function onKeyDown(event) {
    if (event.target.closest('input,textarea,[role="combobox"],[data-effect],[data-keyframe]')) return
    const map = {
      ' ': t.toggle, Home: () => t.setTime(0), End: () => t.setTime(t.duration),
      ArrowLeft: () => t.setTime(t.time - (event.shiftKey ? 1000 : 100)), ArrowRight: () => t.setTime(t.time + (event.shiftKey ? 1000 : 100)),
      '[': () => jump(-1), ']': () => jump(1), k: addKeyframe, K: addKeyframe, Delete: removeSelected, Backspace: removeSelected,
    }
    const action = map[event.key]
    if (!action || event.ctrlKey || event.metaKey) return
    event.preventDefault(); event.stopPropagation()
    action()
  }
  // Panel height: drag the top edge or use the arrow keys on it.
  const resize = useRef(null)
  const startResize = event => { event.currentTarget.setPointerCapture(event.pointerId); resize.current = { y: event.clientY, height: t.height } }

  if (!t.open) return null
  return (
    <section role="region" aria-label="Línea de tiempo" tabIndex={-1} onKeyDown={onKeyDown} className="flex shrink-0 select-none flex-col outline-none border-t border-[hsl(var(--border))] bg-[hsl(var(--card))]"
      style={{ height: t.collapsed ? undefined : t.height }}>
      {t.collapsed ? null : (
        <div role="separator" aria-orientation="horizontal" aria-label="Alto de la línea de tiempo" aria-valuemin={160} aria-valuemax={Math.max(480, Math.round(window.innerHeight * 0.6))} aria-valuenow={t.height} tabIndex={0}
          onKeyDown={event => { if (event.key === 'ArrowUp' || event.key === 'ArrowDown') { event.preventDefault(); event.stopPropagation(); t.setHeight(t.height + (event.key === 'ArrowUp' ? 24 : -24)) } }}
          onPointerDown={startResize} onPointerMove={event => { if (resize.current) t.setHeight(resize.current.height + resize.current.y - event.clientY) }} onPointerUp={() => { resize.current = null }}
          className="h-1.5 shrink-0 cursor-ns-resize touch-none bg-[hsl(var(--border))]/40 hover:bg-fuchsia-500/40 focus-visible:bg-fuchsia-500/60 focus-visible:outline-none" />
      )}
      {/* One row on phones (scrolls sideways) so the tracks keep their room. */}
      <div className={cn('flex shrink-0 items-center gap-1 border-b border-[hsl(var(--border))] px-2 py-1', phone ? 'flex-nowrap overflow-x-auto overscroll-contain' : 'flex-wrap')}>
        <SegmentedControl variant="subtle" ariaLabel="Modo de edición" size="sm" options={MODES} value={t.mode} onChange={mode => { t.setMode(mode); if (mode === 'design') t.setPlaying(false) }} className="w-auto shrink-0 flex-nowrap" />
        <span aria-hidden className="mx-1 h-6 w-px bg-[hsl(var(--border))]" />
        <ToolButton label="Reproducir desde el inicio" side="top" onClick={() => t.playFrom(0)}><RotateCcw /></ToolButton>
        <ToolButton label="Ir al inicio" shortcut="Inicio" side="top" onClick={() => t.setTime(0)}><SkipBack /></ToolButton>
        <ToolButton label={t.playing ? 'Pausar' : 'Reproducir'} shortcut="Espacio" side="top" onClick={t.toggle}>{t.playing ? <Pause /> : <Play />}</ToolButton>
        <ToolButton label="Ir al final" shortcut="Fin" side="top" onClick={() => t.setTime(t.duration)}><SkipForward /></ToolButton>
        <output aria-live="off" className="min-w-[8.5rem] shrink-0 px-1 text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{formatClock(t.time)} / {formatClock(t.duration)}</output>
        <span aria-hidden className="mx-1 h-6 w-px bg-[hsl(var(--border))]" />
        <ToolButton label="Keyframe anterior" shortcut="[" side="top" onClick={() => jump(-1)}><Diamond className="-scale-x-100" /><span className="sr-only">anterior</span></ToolButton>
        <Button type="button" size="sm" variant="ghost" className="h-8 shrink-0 gap-1 px-2" disabled={!editable} onClick={addKeyframe} title="Añadir keyframe en el cabezal (K)"><Diamond className="h-4 w-4 fill-current" aria-hidden />{phone ? 'Keyframe' : 'Añadir keyframe'}</Button>
        <ToolButton label="Keyframe siguiente" shortcut="]" side="top" onClick={() => jump(1)}><Diamond /><span className="sr-only">siguiente</span></ToolButton>
        <span aria-hidden className="mx-1 h-6 w-px bg-[hsl(var(--border))]" />
        {/* Path tools: a whole route at once, unlike dragging (one position at the playhead). */}
        <Button type="button" size="sm" variant={tool.session?.mode === 'draw' ? 'secondary' : 'ghost'} aria-pressed={tool.session?.mode === 'draw'} className="h-8 shrink-0 gap-1 px-2" disabled={!editable}
          onClick={() => (tool.session?.mode === 'draw' ? tool.cancel() : tool.begin('draw'))}><Spline className="h-4 w-4" aria-hidden />{phone ? 'Dibujar' : 'Dibujar movimiento'}</Button>
        <Button type="button" size="sm" variant={tool.session?.mode === 'points' ? 'secondary' : 'ghost'} aria-pressed={tool.session?.mode === 'points'} className="h-8 shrink-0 gap-1 px-2" disabled={!editable}
          onClick={() => (tool.session?.mode === 'points' ? tool.cancel() : tool.begin('points'))}><MousePointerClick className="h-4 w-4" aria-hidden />{phone ? 'Puntos' : 'Crear trayectoria'}</Button>
        <PathMenu target={target} time={t.time} slideDuration={t.duration} readOnly={t.readOnly} clipboard={pathClipboard} onClipboard={setPathClipboard} phone={phone}
          onApply={(id, change) => run(id, () => ({ keyframes: change() }))} />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <ToolButton tone="soft" label={focus.active ? 'Salir del modo enfocado' : 'Modo enfocado: oculta los paneles y amplía el lienzo'} side="top" active={focus.active} onClick={focus.toggle}><Focus /></ToolButton>
          <ToolButton tone="soft" label="Imán" side="top" active={t.snap} onClick={() => t.setSnap(!t.snap)}><Magnet /></ToolButton>
          <ToolButton label="Alejar" side="top" disabled={zoom <= ZOOM_LIMITS.min} onClick={() => t.setZoom(zoom / ZOOM_LIMITS.step)}><ZoomOut /></ToolButton>
          <ToolButton label="Acercar" side="top" disabled={zoom >= ZOOM_LIMITS.max} onClick={() => t.setZoom(zoom * ZOOM_LIMITS.step)}><ZoomIn /></ToolButton>
          <ToolButton label="Ajustar a la diapositiva" side="top" onClick={() => t.setZoom(fitZoom(t.duration, scroll.current.clientWidth - labelWidth))}><StretchHorizontal /></ToolButton>
          <ToolButton label={t.collapsed ? 'Expandir línea de tiempo' : 'Plegar línea de tiempo'} side="top" onClick={() => t.setCollapsed(!t.collapsed)}>{t.collapsed ? <ChevronsUpDown /> : <ChevronsDownUp />}</ToolButton>
          <ToolButton label="Cerrar línea de tiempo" side="top" onClick={() => t.setOpen(false)}><X /></ToolButton>
        </div>
      </div>
      {/* Path tool options dock here, never over the paper the route is drawn on. */}
      {toolBar}
      {t.collapsed ? null : (
        // One fixed line: instructions, or the live times of the segment/keyframe being dragged.
        // Fixed height, no wrapping, tabular digits: it never reflows the tracks below.
        <p aria-live="off" className={cn('flex h-7 shrink-0 items-center gap-2 overflow-hidden whitespace-nowrap border-b border-[hsl(var(--border))] px-3 text-xs',
          t.draft?.readout ? 'font-medium tabular-nums text-fuchsia-700 dark:text-fuchsia-300' : 'text-[hsl(var(--muted-foreground))]')}>
          <span className="min-w-0 truncate">{t.draft?.readout ?? (t.mode === 'animation'
            ? (phone ? 'Arrastrar un elemento fija su posición en el cabezal. «Dibujar» crea un recorrido completo.'
              : 'Arrastrar un elemento fija su posición en el cabezal · «Dibujar movimiento» crea un recorrido completo · Mayús + arrastrar un punto mueve toda la trayectoria')
            : 'Diseño: los cambios modifican la posición base. Pasa a Animación para crear movimiento.')}</span>
        </p>
      )}
      {t.collapsed ? null : (
        <div className={cn('flex min-h-0 flex-1', phone && 'flex-col')}>
          <div ref={scroll} data-timeline-scroll className="min-h-0 min-w-0 flex-1 overflow-auto overscroll-contain"
            onWheel={event => { if (event.ctrlKey || event.metaKey) { event.preventDefault(); t.setZoom(zoom * (event.deltaY < 0 ? 1.15 : 1 / 1.15)) } }}>
            {objects.length ? (
              <TimelineTracks objects={objects} labels={labels} selectedIds={selectedIds} duration={t.duration} end={t.end} zoom={zoom} time={t.time} snap={t.snap} readOnly={t.readOnly} labelWidth={labelWidth}
                selectedKeyframe={t.selectedKeyframe} selectedEffect={t.selectedEffect} onTime={t.setTime}
                onSelectObject={id => { onSelect(id); t.setSelectedEffect(null) }} onSelectGroup={onSelectGroup}
                onSelectKeyframe={(id, at) => { onSelect(id); t.setSelectedKeyframe({ id, at }); t.setTime(at) }}
                onSelectEffect={(id, kind) => { onSelect(id); t.setSelectedEffect({ id, kind }) }} onOpenEffect={(id, kind) => { onSelect(id); t.setSelectedEffect({ id, kind }); onOpenEffect() }}
                onDraft={(id, patch, readout) => t.setDraft({ id, patch, readout })} onCommit={commitTrack}
                onRemoveKeyframe={(object, at) => run(object.id, () => ({ keyframes: removeKeyframe(object, at) }))} />
            ) : <p className="p-4 text-sm text-[hsl(var(--muted-foreground))]">Añade elementos a la página para animarlos.</p>}
          </div>
          {keyframeObject ? (
            <aside className={cn('shrink-0 overflow-y-auto border-[hsl(var(--border))] p-3', phone ? 'max-h-48 border-t' : 'w-64 border-l')}>
              <KeyframeInspector object={keyframeObject} label={labels.get(keyframeObject.id)} at={t.selectedKeyframe.at}
                onMove={to => { const from = t.selectedKeyframe.at; if (to === from) return; run(keyframeObject.id, () => ({ keyframes: moveKeyframe(keyframeObject, from, to) }))?.then(() => { t.setSelectedKeyframe({ id: keyframeObject.id, at: to }); t.setTime(to) }) }}
                onDuplicate={() => run(keyframeObject.id, () => ({ keyframes: duplicatePathPoint(keyframeObject, t.selectedKeyframe.at, t.duration) }))} disabled={t.readOnly || keyframeObject.locked} canPaste={Boolean(t.clipboard)}
                onChange={patch => run(keyframeObject.id, () => ({ keyframes: updateKeyframe(keyframeObject, t.selectedKeyframe.at, patch) }))}
                onRemove={removeSelected} onCopy={() => t.setClipboard(keyframeObject.keyframes.find(frame => frame.at === t.selectedKeyframe.at))}
                onPaste={() => { if (!editable) return; run(target.id, () => ({ keyframes: pasteKeyframe(target, t.time, t.clipboard, options) })); t.setSelectedKeyframe({ id: target.id, at: t.time }) }} />
            </aside>
          ) : null}
        </div>
      )}
    </section>
  )
}
