import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { findPage } from '../../../../../../../shared/studio/pages.js'
import { keyframeValuesAt } from '../../../../../../../shared/studio/motion.js'
import { buildPath, centerAt, centerOffset, pathBudget, positionPath, timePath, withPositionPath } from '../../../lib/motion-path.js'
import { formatClock } from '../../../lib/timeline-math.js'

const DEFAULT_DURATION = 2000, MAX_SAMPLES = 4000

// «Dibujar movimiento» (a stroke) and «Crear trayectoria» (clicked points) share one
// pipeline: offsets from the element's centre at the start instant → timed path →
// keyframes (motion-path.js). Nothing is written until «Aplicar» (one patch = one undo
// step); the preview is a timeline draft, so «Descartar» leaves the document untouched.
export function useMotionPathTool({ timeline: t, doc, activePageId, selectedIds, readOnly, zoom = 1, onError, applyEntries }) {
  const [session, setSession] = useState(null), [stroke, setStroke] = useState(null)
  const capture = useRef(null)
  // findPage builds a new scene each call: memoise on the document, or the preview effect loops.
  const scene = useMemo(() => findPage(doc, activePageId), [doc, activePageId])
  const targets = useMemo(() => (session ? scene?.objects.filter(object => session.ids.includes(object.id)) ?? [] : []), [scene, session])

  const begin = useCallback(mode => {
    const chosen = (scene?.objects ?? []).filter(object => selectedIds.includes(object.id) && !object.locked)
    if (readOnly || !chosen.length) { onError('Selecciona un elemento desbloqueado para crear su movimiento.'); return }
    const start = t.time > t.duration - 500 ? 0 : t.time
    t.setPlaying(false); t.setTime(start); t.setSelectedKeyframe(null); t.setSelectedEffect(null)
    setStroke(null)
    setSession({ mode, ids: chosen.map(object => object.id), anchor: chosen[0].id, start, duration: Math.min(DEFAULT_DURATION, t.duration - start),
      pacing: mode === 'draw' ? 'recorded' : 'distance', curve: 'linear', smooth: mode === 'draw', tolerance: 2.5 / zoom, offsets: [{ x: 0, y: 0, t: 0 }] })
  }, [scene, selectedIds, readOnly, onError, t, zoom])
  const cancel = useCallback(() => { setSession(null); setStroke(null); capture.current = null; t.setDraft(null) }, [t])
  const update = useCallback(patch => setSession(current => (current ? { ...current, ...patch } : current)), [])
  // The tool belongs to the page and the Animación mode it was opened in.
  useEffect(() => { if (session) cancel() }, [activePageId, t.open, t.mode === 'design']) // eslint-disable-line react-hooks/exhaustive-deps

  // Timed keyframes per element; every member of a group follows the same offsets.
  const result = useMemo(() => {
    if (!session || session.offsets.length < 2 || stroke) return null
    try {
      const patches = {}
      let anchorPath = []
      for (const object of targets) {
        const origin = centerAt(object, session.start)
        const points = session.offsets.map(offset => ({ x: origin.x + offset.x, y: origin.y + offset.y, t: offset.t }))
        const timing = { start: session.start, duration: session.duration, pacing: session.pacing, curve: session.curve }
        const route = session.mode === 'draw' || session.smooth ? buildPath(points, { budget: pathBudget(object), smooth: session.smooth, tolerance: session.tolerance, ...timing }) : timePath(points, timing)
        patches[object.id] = { keyframes: withPositionPath(object, route) }
        if (object.id === session.anchor) anchorPath = route
      }
      return { patches, points: anchorPath.length }
    } catch (failure) { return { error: failure.message } }
  }, [session, stroke, targets])

  useEffect(() => {
    if (!session || stroke) return
    if (result?.patches) t.setDraft({ patches: result.patches, readout: `Trayectoria · ${result.points} puntos · ${formatClock(session.start)} – ${formatClock(session.start + session.duration)}` })
    else t.setDraft(null)
  }, [result]) // eslint-disable-line react-hooks/exhaustive-deps

  // While drawing, the elements follow the pointer at the start instant (their path is not drawn yet).
  function follow(dx, dy) {
    const patches = {}
    for (const object of targets) {
      const origin = centerAt(object, session.start), [ox, oy] = centerOffset(object, keyframeValuesAt(object, session.start).rotation)
      patches[object.id] = { x: origin.x + dx - ox, y: origin.y + dy - oy, keyframes: withPositionPath(object, []) }
    }
    t.setDraft({ patches, readout: 'Dibujando movimiento…' })
  }
  // Pointer input in page coordinates (from the tool layer over the paper).
  const pointer = {
    down(point, stamp) {
      if (session.mode === 'points') {
        const origin = centerAt(targets.find(object => object.id === session.anchor), session.start)
        if (session.offsets.length >= Math.min(...targets.map(pathBudget))) { onError('La trayectoria alcanzó el máximo de puntos.'); return }
        update({ offsets: [...session.offsets, { x: point[0] - origin.x, y: point[1] - origin.y }] })
        return
      }
      t.setPlaying(false); t.setTime(session.start)
      capture.current = { origin: point, stamp, samples: [{ x: 0, y: 0, t: 0 }] }
      setStroke(capture.current.samples)
      follow(0, 0)
    },
    move(point, stamp) {
      const c = capture.current
      if (!c) return
      const x = point[0] - c.origin[0], y = point[1] - c.origin[1], last = c.samples.at(-1)
      if (Math.hypot(x - last.x, y - last.y) < 1) return
      // Very long strokes keep every other sample: the shape survives, memory stays bounded.
      if (c.samples.length >= MAX_SAMPLES) c.samples = c.samples.filter((_, index) => index % 2 === 0 || index === c.samples.length - 1)
      c.samples = [...c.samples, { x, y, t: stamp - c.stamp }]
      setStroke(c.samples)
      follow(x, y)
    },
    up() {
      const c = capture.current
      capture.current = null
      setStroke(null)
      if (!c) return
      const far = c.samples.reduce((max, sample) => Math.max(max, Math.hypot(sample.x, sample.y)), 0)
      if (far < 4) { t.setDraft(null); onError('Arrastra para dibujar el recorrido completo.'); return }
      update({ offsets: c.samples })
      t.playFrom(session.start)
    },
  }
  const undoPoint = () => update({ offsets: session.offsets.slice(0, -1) })
  async function apply() {
    if (!result?.patches) return
    const entries = Object.entries(result.patches), anchor = session.anchor
    setSession(null)
    if (entries.length === 1) await t.commit(entries[0][0], entries[0][1])
    else await applyEntries(entries).finally(() => t.setDraft(null))
    const last = positionPath({ ...targets.find(object => object.id === anchor), keyframes: result.patches[anchor].keyframes }).at(-1)
    if (last) t.setSelectedKeyframe({ id: anchor, at: last.at })
  }
  // The live stroke as page points around the anchor's centre (overlay only).
  const anchorObject = targets.find(object => object.id === session?.anchor)
  const live = session && anchorObject ? (() => {
    const origin = centerAt(anchorObject, session.start)
    return (stroke ?? session.offsets).map(offset => [origin.x + offset.x, origin.y + offset.y])
  })() : null
  return { session, update, begin, cancel, pointer, undoPoint, apply, result, drawing: Boolean(stroke), live }
}
