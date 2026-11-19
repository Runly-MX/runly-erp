import { useEffect, useRef } from 'react'
import { cn } from '@runly/ui'
import { Group } from 'lucide-react'
import { MOTION_LIMITS } from '../../../../../../../shared/studio/motion.js'
import { moveKeyframe } from '../../../../../../../shared/studio/keyframes.js'
import { OBJECT_META } from '../LayersPanel.jsx'
import { effectLabel } from '../animation/AnimationPanel.jsx'
import { formatClock, formatSeconds, msToPx, pxToMs, rulerTicks, snapTime } from '../../../lib/timeline-math.js'

// PAD: room before 0 s so a keyframe at the start is not hidden by the labels.
const ROW = 32, RULER = 28, PAD = 8
const COLORS = { enter: 'bg-fuchsia-500 text-white', emphasis: 'bg-amber-500 text-black', exit: 'bg-sky-500 text-white' }
const KINDS = ['enter', 'emphasis', 'exit']
const describe = object => (object.type === 'text' ? object.text.split('\n')[0].slice(0, 40) || 'Texto' : OBJECT_META[object.type].label)
const clampMs = (value, max) => Math.min(max, Math.max(0, Math.round(value)))

// Rows front-to-back (like Capas), with a header before each group's members.
function rowsOf(objects) {
  const rows = [], seen = new Set()
  let groupNumber = 0
  for (const object of [...objects].reverse()) {
    if (object.groupId && !seen.has(object.groupId)) { seen.add(object.groupId); rows.push({ group: object.groupId, number: ++groupNumber }) }
    rows.push({ object })
  }
  return rows
}

export function TimelineTracks({ objects, selectedIds, duration, end, zoom, time, snap, readOnly, labelWidth, selectedKeyframe, selectedEffect,
  onTime, onSelectObject, onSelectGroup, onSelectKeyframe, onSelectEffect, onOpenEffect, onDraft, onCommit, onRemoveKeyframe }) {
  const content = useRef(null), drag = useRef(null)
  const lane = msToPx(end, zoom) + PAD, rows = rowsOf(objects), at = ms => PAD + msToPx(ms, zoom)
  // The selected element's track scrolls into view (below the sticky ruler).
  const focusId = selectedIds[0]
  useEffect(() => { if (focusId) content.current?.querySelector(`[data-track="${CSS.escape(focusId)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' }) }, [focusId])

  // Snap targets: playhead, slide edges, every effect edge and keyframe except the dragged value.
  function targets(skip) {
    const list = [0, duration, time]
    for (const object of objects) {
      for (const kind of KINDS) if (object[kind] && !(skip.id === object.id && skip.kind === kind)) list.push(object[kind].delay, object[kind].delay + object[kind].duration)
      for (const frame of object.keyframes ?? []) if (!(skip.id === object.id && skip.at === frame.at)) list.push(frame.at)
    }
    return list
  }
  const timeAt = event => pxToMs(event.clientX - content.current.getBoundingClientRect().left - labelWidth - PAD, zoom)

  function start(event, target) {
    if (event.button !== 0) return
    event.stopPropagation()
    if (target.part !== 'playhead' && readOnly) { target.select?.(); return }
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* pointer already released */ }
    drag.current = { ...target, origin: timeAt(event), snapTargets: targets(target), patch: null }
    if (target.part === 'playhead') onTime(snapTime(timeAt(event), { zoom, targets: drag.current.snapTargets, enabled: snap && !event.altKey }))
  }
  function move(event) {
    const d = drag.current
    if (!d) return
    const delta = timeAt(event) - d.origin, snapped = value => snapTime(value, { zoom, targets: d.snapTargets, enabled: snap && !event.altKey })
    if (d.part === 'playhead') { onTime(snapped(timeAt(event))); return }
    if (Math.abs(msToPx(delta, zoom)) < 2 && !d.patch) return
    const { object } = d
    let readout
    if (d.part === 'keyframe') {
      const to = clampMs(snapped(d.at + delta), MOTION_LIMITS.maxDelay)
      try { d.patch = { keyframes: moveKeyframe(object, d.at, to) } } catch { return }
      readout = `Keyframe · ${formatClock(to)}`
    } else {
      const effect = object[d.kind], endAt = effect.delay + effect.duration
      let next
      if (d.part === 'body') next = { delay: clampMs(snapped(effect.delay + delta), MOTION_LIMITS.maxDelay) }
      if (d.part === 'end') next = { duration: clampMs(snapped(endAt + delta) - effect.delay, MOTION_LIMITS.maxEffectDuration) }
      if (d.part === 'start') { const begin = Math.min(endAt, clampMs(snapped(effect.delay + delta), endAt)); next = { delay: begin, duration: Math.min(MOTION_LIMITS.maxEffectDuration, endAt - begin) } }
      d.patch = { [d.kind]: { ...effect, ...next } }
      const moved = d.patch[d.kind]
      readout = `${effectLabel(d.kind, moved)} · ${formatClock(moved.delay)} – ${formatClock(moved.delay + moved.duration)}`
    }
    // The readout is shown in the timeline's fixed help bar, never next to the pointer.
    onDraft(object.id, d.patch, readout)
  }
  function finish() {
    const d = drag.current
    drag.current = null
    if (!d || d.part === 'playhead') return
    if (d.patch) onCommit(d.object.id, d.patch)
    else d.select?.()
  }
  // Keyboard on a focused segment or keyframe: arrows move 100 ms (Shift 1 s); Alt+arrows change the duration.
  function keys(event, target) {
    const step = (event.shiftKey ? 1000 : 100) * (event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0)
    // Handled keys never reach the editor shortcuts (Supr there would delete the whole element).
    if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); target.open?.(); return }
    if (target.at !== undefined && (event.key === 'Delete' || event.key === 'Backspace')) { event.preventDefault(); event.stopPropagation(); if (!readOnly) onRemoveKeyframe(target.object, target.at); return }
    if (!step || readOnly) return
    event.preventDefault(); event.stopPropagation()
    const { object } = target
    if (target.at !== undefined) { try { onCommit(object.id, { keyframes: moveKeyframe(object, target.at, clampMs(target.at + step, MOTION_LIMITS.maxDelay)) }) } catch { /* occupied instant */ } return }
    const effect = object[target.kind]
    onCommit(object.id, { [target.kind]: event.altKey ? { ...effect, duration: clampMs(effect.duration + step, MOTION_LIMITS.maxEffectDuration) } : { ...effect, delay: clampMs(effect.delay + step, MOTION_LIMITS.maxDelay) } })
  }

  const handlers = { onPointerMove: move, onPointerUp: finish, onPointerCancel: () => { drag.current = null } }
  return (
    <div ref={content} className="relative select-none" style={{ width: labelWidth + lane + 16, minHeight: '100%' }}>
      <div className="sticky top-0 z-20 flex border-b border-[hsl(var(--border))] bg-[hsl(var(--card))]" style={{ height: RULER }}>
        <div className="sticky left-0 z-10 shrink-0 border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]" style={{ width: labelWidth }} />
        <div role="slider" tabIndex={-1} aria-label="Cabezal de reproducción" aria-valuemin={0} aria-valuemax={end} aria-valuenow={time} aria-valuetext={formatSeconds(time)}
          className="relative cursor-ew-resize touch-none" style={{ width: lane }} onPointerDown={event => start(event, { part: 'playhead' })} {...handlers}>
          {rulerTicks(end, zoom).map(tick => (
            <span key={tick.at} className={cn('absolute bottom-0 w-px bg-[hsl(var(--border))]', tick.major ? 'h-3' : 'h-1.5')} style={{ left: at(tick.at) }}>
              {tick.major ? <span className="absolute -top-3.5 left-1 whitespace-nowrap text-[10px] tabular-nums text-[hsl(var(--muted-foreground))]">{formatSeconds(tick.at)}</span> : null}
            </span>
          ))}
        </div>
      </div>
      {rows.map(row => row.group ? (
        <div key={`g:${row.group}`} className="flex" style={{ height: ROW - 6 }}>
          <button type="button" onClick={() => onSelectGroup(row.group)} className="sticky left-0 z-10 flex shrink-0 items-center gap-1.5 truncate border-r border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]" style={{ width: labelWidth }}>
            <Group className="h-3.5 w-3.5 shrink-0" aria-hidden />Grupo {row.number}
          </button>
          <div style={{ width: lane }} />
        </div>
      ) : (() => {
        const object = row.object, active = selectedIds.includes(object.id), locked = readOnly || object.locked
        return (
          <div key={object.id} data-track={object.id} className={cn('flex border-b border-[hsl(var(--border)/0.5)]', active && 'bg-fuchsia-500/10')} style={{ height: ROW, scrollMarginTop: RULER }}>
            <button type="button" onClick={() => onSelectObject(object.id)} aria-pressed={active}
              className={cn('sticky left-0 z-10 flex shrink-0 items-center truncate border-r border-[hsl(var(--border))] px-2 text-left text-xs', object.groupId && 'pl-5', active ? 'bg-fuchsia-50 font-semibold text-fuchsia-900 dark:bg-fuchsia-950 dark:text-fuchsia-100' : 'bg-[hsl(var(--card))] hover:bg-[hsl(var(--muted))]')}
              style={{ width: labelWidth }}>{describe(object)}</button>
            <div className="relative" style={{ width: lane }}>
              {KINDS.filter(kind => object[kind]).map(kind => {
                const effect = object[kind], left = at(effect.delay), width = Math.max(10, msToPx(effect.duration, zoom))
                const target = { object, kind, id: object.id, select: () => onSelectEffect(object.id, kind), open: () => onOpenEffect(object.id, kind) }
                const chosen = selectedEffect?.id === object.id && selectedEffect.kind === kind
                return (
                  <div key={kind} className={cn('absolute top-1 flex h-[22px] items-center overflow-hidden rounded-md text-[10px] font-medium shadow-sm', COLORS[kind], chosen && 'ring-2 ring-[hsl(var(--foreground))]', object.locked && 'opacity-60')} style={{ left, width }}>
                    <button type="button" data-effect={kind} aria-label={`${effectLabel(kind, effect)}, de ${formatSeconds(effect.delay)} a ${formatSeconds(effect.delay + effect.duration)}`}
                      className={cn('h-full min-w-0 flex-1 truncate px-2 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white', !locked && 'cursor-grab touch-none')}
                      onPointerDown={event => start(event, { ...target, part: 'body' })} onDoubleClick={target.open} onKeyDown={event => keys(event, target)} {...handlers}>{effectLabel(kind, effect).split(': ')[1]}</button>
                    {locked ? null : ['start', 'end'].map(part => (
                      <span key={part} data-handle={part} aria-hidden className={cn('absolute top-0 h-full w-2 cursor-ew-resize touch-none bg-black/20', part === 'start' ? 'left-0' : 'right-0')}
                        onPointerDown={event => start(event, { ...target, part })} {...handlers} />
                    ))}
                  </div>
                )
              })}
              {/* Keyed by position: the element (and its pointer capture) survives a drag that changes its instant. */}
              {(object.keyframes ?? []).map((frame, index) => {
                const chosen = selectedKeyframe?.id === object.id && selectedKeyframe.at === frame.at
                const target = { object, at: frame.at, id: object.id, select: () => onSelectKeyframe(object.id, frame.at), open: () => onSelectKeyframe(object.id, frame.at) }
                return (
                  <button key={index} type="button" data-keyframe={frame.at} aria-label={`Keyframe en ${formatSeconds(frame.at)}`} aria-pressed={chosen}
                    className={cn('absolute top-1/2 z-[1] h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px] border-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
                      chosen ? 'border-fuchsia-700 bg-fuchsia-500' : 'border-[hsl(var(--foreground))] bg-[hsl(var(--card))]', !locked && 'cursor-grab touch-none')}
                    style={{ left: at(frame.at) }} onPointerDown={event => start(event, { ...target, part: 'keyframe' })} onKeyDown={event => keys(event, target)} {...handlers} />
                )
              })}
            </div>
          </div>
        )
      })())}
      <div aria-hidden className="pointer-events-none absolute bottom-0 right-0 z-0" style={{ left: labelWidth + at(duration), top: RULER,
        backgroundImage: 'repeating-linear-gradient(135deg, hsl(var(--muted-foreground) / 0.12) 0 6px, transparent 6px 12px)' }} />
      <div aria-hidden className="pointer-events-none absolute top-0 bottom-0 z-30 w-0.5 bg-fuchsia-600" style={{ left: labelWidth + at(time) }}>
        <span className="absolute -left-1.5 top-0 h-3 w-3.5 rounded-b-sm bg-fuchsia-600" />
      </div>
    </div>
  )
}
