import { useRef, useState } from 'react'
import { Button, NumberStepper, SegmentedControl, SliderRow, ToolButton, Tooltip, TooltipContent, TooltipTrigger, cn } from '@runly/ui'
import { ArrowLeftRight, RotateCcw, Trash2 } from 'lucide-react'
import { gradientColor } from '../../../../../../../shared/studio/gradient.js'
import { GRADIENT_PRESETS, freeOffset, indexOfOffset, paintCss, samePaint, stopAt, stopsCss } from '../../../lib/paint.js'
import { ColorPopover } from '../StudioColorPicker.jsx'

const CHECKER = 'repeating-conic-gradient(#cbd5e1 0% 25%, #ffffff 0% 50%) 50% / 12px 12px'
const MAX_STOPS = 12
const sortedIndex = (paint, index, offset) => indexOfOffset({ ...paint, stops: paint.stops.map((stop, i) => (i === index ? { ...stop, offset } : stop)).sort((a, b) => a.offset - b.offset) }, offset)
const toRadial = paint => ({ type: 'gradient', gradientType: 'radial', centerX: 0.5, centerY: 0.5, radius: 0.75, stops: paint.stops })
const toLinear = paint => ({ type: 'gradient', gradientType: 'linear', angle: 0, stops: paint.stops })

// Engine calls run one at a time; while one is pending only the latest
// requested change is kept, so drags stay smooth and end in order.
function useSerial(onError) {
  const state = useRef({ busy: false, next: null, idle: [] })
  const send = job => {
    const queue = state.current
    queue.next = job
    if (queue.busy) return
    queue.busy = true
    ;(async () => {
      while (queue.next) { const run = queue.next; queue.next = null; try { await run() } catch (error) { onError?.(error.message) } }
      queue.busy = false; queue.idle.splice(0).forEach(resolve => resolve())
    })()
  }
  const flush = () => (state.current.busy ? new Promise(resolve => state.current.idle.push(resolve)) : Promise.resolve())
  // Gesture boundaries must never be dropped in favour of a later change.
  const then = async job => { await flush(); try { await job() } catch (error) { onError?.(error.message) } }
  return { send, flush, then }
}

// Visual gradient editor shared by shapes and the page background. `api`:
// { begin, end(commit), set(paint), updateStop(i, patch), addStop(stop), removeStop(i), reverse(), reset() }.
export function GradientEditor({ paint, disabled, api, onError, compact = false, children }) {
  const [selected, setSelected] = useState(0), [drag, setDrag] = useState(null)
  const bar = useRef(null), live = useRef(null)
  const serial = useSerial(onError)
  const index = Math.min(selected, paint.stops.length - 1), stop = paint.stops[index]
  const linear = paint.gradientType === 'linear'
  const offsetAt = event => { const rect = bar.current.getBoundingClientRect(); return (event.clientX - rect.left) / rect.width }
  const gesture = { onStart: () => serial.then(api.begin), onCommit: () => serial.then(() => api.end(true)) }

  function add(event) {
    if (disabled || paint.stops.length >= MAX_STOPS || event.target !== bar.current) return
    const offset = freeOffset(paint, offsetAt(event))
    if (offset === null) return
    const next = stopAt(paint, offset)
    setSelected(indexOfOffset({ ...paint, stops: [...paint.stops, next].sort((a, b) => a.offset - b.offset) }, offset))
    serial.then(() => api.addStop(next))
  }
  function grab(event, i) {
    event.stopPropagation(); setSelected(i)
    if (disabled || event.button > 0) return
    event.currentTarget.setPointerCapture(event.pointerId)
    live.current = { paint, index: i }
    setDrag({ index: i, offset: paint.stops[i].offset })
    serial.then(api.begin)
  }
  function move(event) {
    const current = live.current
    if (!current) return
    const offset = freeOffset(current.paint, offsetAt(event), current.index)
    if (offset === null) return
    const target = current.index, next = sortedIndex(current.paint, target, offset)
    current.paint = { ...current.paint, stops: current.paint.stops.map((s, i) => (i === target ? { ...s, offset } : s)).sort((a, b) => a.offset - b.offset) }
    current.index = next
    setDrag({ index: next, offset }); setSelected(next)
    serial.send(() => api.updateStop(target, { offset }))
  }
  async function drop() {
    if (!live.current) return
    live.current = null; setDrag(null)
    await serial.then(() => api.end(true))
  }
  function key(event, i) {
    const step = event.shiftKey ? 0.1 : 0.01, delta = { ArrowLeft: -step, ArrowRight: step }[event.key]
    // Handled keys belong to the stop, never to the canvas shortcuts (Supr = delete selection).
    if (delta !== undefined || event.key === 'Delete' || event.key === 'Backspace') event.stopPropagation()
    if (delta !== undefined) {
      event.preventDefault()
      const offset = freeOffset(paint, paint.stops[i].offset + delta, i)
      if (offset !== null) { setSelected(sortedIndex(paint, i, offset)); serial.then(() => api.updateStop(i, { offset })) }
    } else if ((event.key === 'Delete' || event.key === 'Backspace') && paint.stops.length > 2) {
      event.preventDefault(); setSelected(Math.max(0, i - 1)); serial.then(() => api.removeStop(i))
    }
  }
  const shown = drag ? { ...paint, stops: live.current?.paint.stops ?? paint.stops } : paint

  return (
    <div className="space-y-3">
      <SegmentedControl ariaLabel="Tipo de degradado" value={paint.gradientType} disabled={disabled}
        onChange={type => { if (type !== paint.gradientType) serial.then(() => api.set(type === 'radial' ? toRadial(paint) : toLinear(paint))) }}
        options={[{ value: 'linear', label: 'Lineal' }, { value: 'radial', label: 'Radial' }]} className="w-full [&_button]:min-w-0" />
      <div className="px-2 pb-1 pt-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <div ref={bar} role="presentation" onPointerDown={add} aria-disabled={disabled}
              className={cn('relative h-8 rounded-md ring-1 ring-inset ring-black/10 dark:ring-white/15', disabled ? 'opacity-60' : 'cursor-copy')}
              style={{ background: `${stopsCss(shown)}, ${CHECKER}` }}>
              {shown.stops.map((s, i) => (
                // Keyed by position so a dragged handle keeps its pointer capture while stops re-sort.
                <button key={i} type="button" disabled={disabled}
                  aria-label={`Punto ${i + 1}: ${s.color.toUpperCase()}, ${Math.round(s.offset * 100)} %`} aria-pressed={i === index}
                  onPointerDown={event => grab(event, i)} onPointerMove={move} onPointerUp={drop} onPointerCancel={drop} onKeyDown={event => key(event, i)} onClick={() => setSelected(i)}
                  className={cn('absolute top-1/2 h-10 w-4 -translate-x-1/2 -translate-y-1/2 touch-none rounded-md border-2 shadow-md outline-none transition-[box-shadow] motion-reduce:transition-none',
                    'focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-1',
                    i === index ? 'z-10 border-fuchsia-600 dark:border-fuchsia-400' : 'border-white dark:border-slate-200', disabled ? 'cursor-not-allowed' : 'cursor-ew-resize')}
                  style={{ left: `${s.offset * 100}%`, background: `linear-gradient(${gradientColor(s)}, ${gradientColor(s)}), ${CHECKER}` }} />
              ))}
            </div>
          </TooltipTrigger>
          <TooltipContent side="top">Clic para añadir un punto · arrastra para moverlo · Supr para quitarlo</TooltipContent>
        </Tooltip>
      </div>
      {stop ? (
        <div className="space-y-2 rounded-lg bg-[hsl(var(--muted)/0.5)] p-2.5">
          <div className="flex items-center gap-2">
            <ColorPopover label="Color del punto" value={stop.color} disabled={disabled} onChange={color => serial.then(() => api.updateStop(index, { color }))} />
            <NumberStepper label="Posición del punto (%)" size="sm" min={0} max={100} step={1} value={Math.round(stop.offset * 100)} disabled={disabled}
              onChange={value => { const offset = freeOffset(paint, value / 100, index); if (offset !== null) { setSelected(sortedIndex(paint, index, offset)); serial.then(() => api.updateStop(index, { offset })) } }} />
            <ToolButton label="Quitar punto" shortcut="Supr" side="bottom" disabled={disabled || paint.stops.length <= 2} className="ml-auto"
              onClick={() => { setSelected(Math.max(0, index - 1)); serial.then(() => api.removeStop(index)) }}><Trash2 /></ToolButton>
          </div>
          <SliderRow label="Opacidad del punto" min={0} max={100} zero={100} value={Math.round(stop.opacity * 100)} format={value => `${value} %`} disabled={disabled}
            {...gesture} onChange={value => serial.send(() => api.updateStop(index, { opacity: value / 100 }))} />
        </div>
      ) : null}
      {linear ? (
        <SliderRow label="Ángulo" min={0} max={360} zero={0} value={Math.round(((paint.angle % 360) + 360) % 360)} format={value => `${value}°`} disabled={disabled}
          {...gesture} onChange={angle => serial.send(() => api.set({ ...paint, angle }))} />
      ) : (
        <>
          <SliderRow label="Tamaño" min={10} max={200} zero={75} value={Math.round(paint.radius * 100)} format={value => `${value} %`} disabled={disabled}
            {...gesture} onChange={value => serial.send(() => api.set({ ...paint, radius: value / 100 }))} />
          {!compact ? (
            <>
              <SliderRow label="Centro horizontal" min={0} max={100} zero={50} value={Math.round(paint.centerX * 100)} format={value => `${value} %`} disabled={disabled}
                {...gesture} onChange={value => serial.send(() => api.set({ ...paint, centerX: value / 100 }))} />
              <SliderRow label="Centro vertical" min={0} max={100} zero={50} value={Math.round(paint.centerY * 100)} format={value => `${value} %`} disabled={disabled}
                {...gesture} onChange={value => serial.send(() => api.set({ ...paint, centerY: value / 100 }))} />
            </>
          ) : null}
        </>
      )}
      <div className="flex gap-2">
        <Button variant="outline" size="sm" className="flex-1 gap-1.5" disabled={disabled} onClick={() => serial.then(api.reverse)}><ArrowLeftRight className="h-3.5 w-3.5" />Invertir</Button>
        <Button variant="ghost" size="sm" className="flex-1 gap-1.5" disabled={disabled} onClick={() => { setSelected(0); serial.then(api.reset) }}><RotateCcw className="h-3.5 w-3.5" />Restablecer</Button>
      </div>
      <GradientPresets paint={paint} disabled={disabled} onPick={preset => { setSelected(0); serial.then(() => api.set(preset)) }} />
      {children}
    </div>
  )
}

export function GradientPresets({ paint, disabled, onPick, columns = 4 }) {
  return (
    <div role="radiogroup" aria-label="Degradados predefinidos" className={cn('grid gap-2', columns === 4 ? 'grid-cols-4' : 'grid-cols-8')}>
      {GRADIENT_PRESETS.map(preset => {
        const active = samePaint(preset.paint, paint)
        return (
          <Tooltip key={preset.key}>
            <TooltipTrigger asChild>
              <button type="button" role="radio" aria-checked={active} aria-label={`Degradado ${preset.label}`} disabled={disabled} onClick={() => onPick(preset.paint)}
                className={cn('aspect-square rounded-md outline-none ring-offset-2 ring-offset-[hsl(var(--card))] transition-transform hover:scale-105 focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-50 motion-reduce:transition-none',
                  active && 'ring-2 ring-fuchsia-500')}
                style={{ background: paintCss(preset.paint) }} />
            </TooltipTrigger>
            <TooltipContent side="bottom">{preset.label}</TooltipContent>
          </Tooltip>
        )
      })}
    </div>
  )
}
