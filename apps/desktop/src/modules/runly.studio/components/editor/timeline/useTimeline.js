import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { findPage, withPages, documentPages, pageId as idOf } from '../../../../../../../shared/studio/pages.js'
import { slideDuration } from '../../../../../../../shared/studio/motion.js'
import { clampZoom, timelineEnd } from '../../../lib/timeline-math.js'

const HEIGHT_KEY = 'runly:studio:timeline-height'
const readHeight = () => { try { return Number(localStorage.getItem(HEIGHT_KEY)) || 240 } catch { return 240 } }
const reducedMotionQuery = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Timeline state over the editor's document: playhead, playback, zoom, snapping, the
// Diseño/Animación mode and a drag draft. Only `commit` writes (one editor patch = one
// undo step and one sync batch); moving the playhead or zooming never writes.
export function useTimeline({ editorRef, doc, activePageId, readOnly, attempt }) {
  const [open, setOpen] = useState(false), [collapsed, setCollapsed] = useState(false)
  const [mode, setMode] = useState('design'), [time, setTimeState] = useState(0), [playing, setPlaying] = useState(false)
  const [zoom, setZoomState] = useState(null), [snap, setSnap] = useState(true), [height, setHeightState] = useState(readHeight)
  const [selectedKeyframe, setSelectedKeyframe] = useState(null), [selectedEffect, setSelectedEffect] = useState(null)
  const [draft, setDraft] = useState(null), [clipboard, setClipboard] = useState(null)
  const scene = findPage(doc, activePageId) ?? documentPages(doc)[0]
  const duration = slideDuration(scene.page), end = timelineEnd(duration, scene.objects)
  const [reducedMotion] = useState(reducedMotionQuery)

  // The document drawn on the animated canvas: the editor's document plus the drag in progress.
  const frameDoc = useMemo(() => {
    if (!draft) return doc
    return withPages(doc, documentPages(doc).map(page => idOf(page) !== activePageId ? page : { ...page, objects: page.objects.map(object => {
      if (object.id !== draft.id) return object
      const next = { ...object, ...draft.patch }
      for (const [key, value] of Object.entries(draft.patch)) if (value === undefined) delete next[key]
      return next
    }) }))
  }, [doc, draft, activePageId])

  const setTime = useCallback(value => { setTimeState(Math.max(0, Math.min(end, Math.round(value)))); setMode('animation') }, [end])
  const setZoom = useCallback(value => setZoomState(clampZoom(value)), [])
  const setHeight = useCallback(value => {
    const next = Math.round(Math.min(480, Math.max(160, value)))
    setHeightState(next)
    try { localStorage.setItem(HEIGHT_KEY, String(next)) } catch { /* per-viewer convenience only */ }
  }, [])

  // Playback: time is read from a stable clock, never accumulated, and stops at the slide end.
  const origin = useRef(0)
  useEffect(() => {
    if (!playing) return undefined
    let frame
    origin.current = performance.now() - (time >= duration ? 0 : time)
    const loop = () => {
      const at = Math.min(duration, performance.now() - origin.current)
      setTimeState(Math.round(at))
      if (at >= duration) { setPlaying(false); return }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [playing]) // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = useCallback(() => { setMode('animation'); setPlaying(value => !value) }, [])
  useEffect(() => { setPlaying(false); setSelectedKeyframe(null); setSelectedEffect(null); setDraft(null) }, [activePageId])
  useEffect(() => { if (!open) { setPlaying(false); setMode('design'); setDraft(null) } }, [open])

  // One logical edit of one object: select it individually, then the editor's patch.
  const commit = useCallback((id, patch) => attempt(async () => {
    if (readOnly) throw Error('Diseño de solo lectura.')
    const editor = editorRef.current
    editor.select(id, { individual: true })
    await editor.patch(patch)
  }).finally(() => setDraft(null)), [attempt, editorRef, readOnly])

  return {
    open, setOpen, collapsed, setCollapsed, mode, setMode, time, setTime, playing, toggle, setPlaying,
    zoom, setZoom, snap, setSnap, height, setHeight, duration, end, scene, frameDoc, draft, setDraft,
    selectedKeyframe, setSelectedKeyframe, selectedEffect, setSelectedEffect, clipboard, setClipboard, commit,
    reducedMotion: playing && reducedMotion, readOnly,
  }
}
