import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { documentPages, pageId } from '../../../../../../shared/studio/pages.js'
import { presentationSequence, transitionAt } from '../../../../../../shared/studio/motion.js'
import { createSlideFrames } from '../../lib/slide-frames.js'
import { advanceIfDue, elapsedOf, goTo, next, previous, restartClock, setLoop, setPlaying, startPresentation } from '../../lib/presentation-state.js'

const clock = () => performance.now()
// The editor rejects a stale snapshot ("El diseño cambió…") or a removed page.
const isStale = error => /cambió|ya no existe/i.test(error?.message ?? '')

// Player state for one presentation session over a frozen snapshot of the
// design. Frames come from slide-frames; timing from presentation-state.
export function usePresentation({ editor, startPageId, stage, reducedMotion }) {
  const [snapshot, setSnapshot] = useState(() => editor.snapshot())
  const pages = useMemo(() => documentPages(snapshot), [snapshot])
  const sequence = useMemo(() => presentationSequence(snapshot), [snapshot])
  const [state, setState] = useState(() => startPresentation({ count: pages.length, index: Math.max(0, pages.findIndex(scene => pageId(scene) === startPageId)), now: clock() }))
  const update = useCallback(change => setState(current => change(current, clock())), [])
  const frames = useMemo(() => (stage ? createSlideFrames({ editor, document: snapshot, pages, stage }) : null), [editor, snapshot, pages, stage])
  useEffect(() => () => frames?.destroy(), [frames])
  // shown: the slide on screen; leaving: the previous one while a transition runs.
  const [view, setView] = useState({ shown: null, leaving: null, transition: null, direction: 1, since: 0 })
  const [failure, setFailure] = useState(null), [now, setNow] = useState(clock)
  const index = Math.min(state.index, pages.length - 1), current = sequence[index]

  useEffect(() => {
    if (!frames) return undefined
    let live = true
    setFailure(null)
    frames.frame(current.pageId).then(url => {
      if (!live) return
      const at = clock()
      setView(before => {
        const moving = before.shown && before.shown.index !== index
        // Going back plays the transition of the slide being left, reversed.
        const transition = moving ? (state.direction > 0 ? current.transition : sequence[before.shown.index]?.transition) : null
        const animate = moving && !reducedMotion && transition && transition.type !== 'none' && transition.duration > 0
        return { shown: { index, url }, leaving: animate ? before.shown : null, transition: animate ? transition : null, direction: state.direction, since: at }
      })
      update(s => (s.index === index ? restartClock(s, at) : s))
      frames.prefetch([sequence[index + 1]?.pageId, sequence[index - 1]?.pageId, state.loop ? sequence[0]?.pageId : null])
    }).catch(error => { if (live && error?.name !== 'AbortError') setFailure({ message: error.message, stale: isStale(error) }) })
    return () => { live = false }
  }, [frames, index]) // eslint-disable-line react-hooks/exhaustive-deps

  const ready = view.shown?.index === index
  const transitioning = Boolean(view.transition) && now - view.since < view.transition.duration
  // One animation-frame loop while playing or transitioning; time is read, never accumulated.
  useEffect(() => {
    if (!state.playing && !transitioning) return undefined
    let frame
    const loop = () => {
      const at = clock()
      setNow(at)
      if (ready) setState(s => advanceIfDue(s, at, sequence[s.index]?.duration ?? Infinity))
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [state.playing, transitioning, ready, sequence])

  const layers = useMemo(() => {
    if (!view.shown) return { incoming: null, outgoing: null }
    if (!transitioning) return { incoming: { url: view.shown.url, index: view.shown.index, opacity: 1, dx: 0, dy: 0, scale: 1 }, outgoing: null }
    const state = transitionAt(view.transition, (now - view.since) / view.transition.duration, view.direction)
    return { incoming: { url: view.shown.url, index: view.shown.index, ...state.incoming }, outgoing: { url: view.leaving.url, index: view.leaving.index, ...state.outgoing } }
  }, [view, transitioning, now])

  const refresh = useCallback(async () => {
    await editor.flush()
    const fresh = editor.snapshot(), count = documentPages(fresh).length
    setView({ shown: null, leaving: null, transition: null, direction: 1, since: 0 })
    setSnapshot(fresh)
    update(s => ({ ...goTo({ ...s, count }, Math.min(s.index, count - 1), clock()), playing: s.playing }))
  }, [editor, update])

  return {
    pages, sequence, index, state, ready, layers, failure,
    progress: state.playing && ready ? Math.min(1, elapsedOf(state, now) / current.duration) : 0,
    actions: {
      next: () => update(next), previous: () => update(previous),
      first: () => update((s, at) => goTo(s, 0, at)), last: () => update((s, at) => goTo(s, s.count - 1, at)),
      toggle: () => { setNow(clock()); update((s, at) => setPlaying(s, !s.playing, at)) },
      toggleLoop: () => update(s => setLoop(s, !s.loop)),
      restartSlide: () => update(restartClock),
      refresh,
    },
  }
}
