import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { documentPages, pageId } from '../../../../../../shared/studio/pages.js'
import { presentationSequence, sceneHasMotion, transitionAt } from '../../../../../../shared/studio/motion.js'
import { createSlideFrames } from '../../lib/slide-frames.js'
import { advanceIfDue, goTo, motionTime, next, previous, restartClock, setFrozen, setLoop, setPlaying, startPresentation } from '../../lib/presentation-state.js'

const clock = () => performance.now()
// The editor rejects a stale snapshot ("El diseño cambió…") or a removed page.
const isStale = error => /cambió|ya no existe/i.test(error?.message ?? '')
const EMPTY_VIEW = { shown: null, leaving: null, transition: null, direction: 1 }

// Player state for one presentation session over a frozen snapshot of the design.
// Static slides are images (slide-frames); slides with object motion are drawn live
// by MotionStage from sceneAt. Timing comes from presentation-state.
export function usePresentation({ editor, startPageId, stage, reducedMotion }) {
  const [snapshot, setSnapshot] = useState(() => editor.snapshot())
  const pages = useMemo(() => documentPages(snapshot), [snapshot])
  const sequence = useMemo(() => presentationSequence(snapshot).map((entry, index) => ({ ...entry, animated: sceneHasMotion(pages[index]) })), [snapshot, pages])
  const [state, setState] = useState(() => startPresentation({ count: pages.length, index: Math.max(0, pages.findIndex(scene => pageId(scene) === startPageId)), now: clock() }))
  const stateRef = useRef(state)
  stateRef.current = state
  const frames = useMemo(() => (stage ? createSlideFrames({ editor, document: snapshot, pages, stage }) : null), [editor, snapshot, pages, stage])
  useEffect(() => () => frames?.destroy(), [frames])
  const [view, setView] = useState(EMPTY_VIEW), viewRef = useRef(view)
  viewRef.current = view
  const [failure, setFailure] = useState(null), [now, setNow] = useState(clock)
  // The live stage of the slide on screen; its pixels are captured before it unmounts.
  const live = useRef(null)
  const index = Math.min(state.index, pages.length - 1), current = sequence[index]

  // A live slide unmounts as soon as the index changes: keep its last pixels on screen
  // (and as the outgoing layer of the transition) until the next slide is revealed.
  const captureLeaving = useCallback(() => {
    const shown = viewRef.current.shown, canvas = shown?.kind === 'live' ? live.current?.capture() : null
    if (canvas) setView(v => (v.shown === shown ? { ...v, shown: { index: shown.index, kind: 'canvas', canvas } } : v))
  }, [])
  const navigate = useCallback(change => {
    const s = stateRef.current, target = change(s, clock())
    if (target.index !== s.index) captureLeaving()
    // Restarting the same slide replays its animations, never the transition that brought it.
    else setView(v => (v.transition ? { ...v, leaving: null, transition: null } : v))
    setState(target)
  }, [captureLeaving])

  // Reveal the slide at `index` once its pixels exist, starting the transition.
  const reveal = useCallback((target, entry) => {
    const at = clock(), before = viewRef.current.shown, direction = stateRef.current.direction
    const leaving = before && before.index !== target && before.kind !== 'live' ? before : null
    const transition = leaving ? (direction > 0 ? sequence[target].transition : sequence[leaving.index]?.transition) : null
    const animate = Boolean(leaving) && !reducedMotion && transition && transition.type !== 'none' && transition.duration > 0
    // The transition runs on the slide clock restarted here: pausing freezes it too.
    setView({ shown: { index: target, ...entry }, leaving: animate ? leaving : null, transition: animate ? transition : null, direction })
    setState(s => (s.index === target ? restartClock(s, at) : s))
    if (frames) frames.prefetch([sequence[target + 1], sequence[target - 1], stateRef.current.loop ? sequence[0] : null].filter(entry => entry && !entry.animated).map(entry => entry.pageId))
  }, [sequence, reducedMotion, frames])

  useEffect(() => {
    if (!frames) return undefined
    setFailure(null)
    if (current.animated) return undefined // MotionStage calls onLiveReady
    let active = true
    frames.frame(current.pageId).then(url => { if (active) reveal(index, { kind: 'image', url }) })
      .catch(error => { if (active && error?.name !== 'AbortError') setFailure({ message: error.message, stale: isStale(error) }) })
    return () => { active = false }
  }, [frames, index]) // eslint-disable-line react-hooks/exhaustive-deps

  const ready = view.shown?.index === index
  const liveShown = ready && view.shown.kind === 'live'
  const slideTime = ready ? motionTime(state, now) : 0
  // Drawn only once the destination is on screen, at the time of the one slide clock.
  const transitioning = ready && Boolean(view.transition) && slideTime < view.transition.duration
  const animating = liveShown && !state.frozen && slideTime < current.duration
  // One animation-frame loop while anything moves; time is read, never accumulated.
  useEffect(() => {
    if (state.frozen || (!state.playing && !transitioning && !animating)) return undefined
    let frame
    const loop = () => {
      const at = clock()
      setNow(at)
      if (ready) {
        const s = stateRef.current, target = advanceIfDue(s, at, sequence[s.index]?.duration ?? Infinity)
        if (target !== s) { if (target.index !== s.index) captureLeaving(); setState(target) }
      }
      frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [state.playing, state.frozen, transitioning, animating, ready, sequence, captureLeaving])

  const layers = useMemo(() => {
    if (!view.shown) return { incoming: null, outgoing: null }
    if (!transitioning) return { incoming: { ...view.shown, opacity: 1, dx: 0, dy: 0, scale: 1 }, outgoing: null, front: 'incoming' }
    const layer = transitionAt(view.transition, slideTime / view.transition.duration, view.direction)
    return { incoming: { ...view.shown, ...layer.incoming }, outgoing: { ...view.leaving, ...layer.outgoing }, front: layer.front }
  }, [view, transitioning, slideTime])

  const refresh = useCallback(async () => {
    await editor.flush()
    const fresh = editor.snapshot(), count = documentPages(fresh).length
    setView(EMPTY_VIEW)
    setSnapshot(fresh)
    setState(s => ({ ...goTo({ ...s, count }, Math.min(s.index, count - 1), clock()), playing: s.playing }))
  }, [editor])

  return {
    pages, sequence, index, state, ready, layers, failure, snapshot, live,
    // The live slide for MotionStage: the one on screen, or the next one loading underneath.
    liveSlide: current.animated ? { index, pageId: current.pageId, time: slideTime, shown: liveShown } : null,
    onLiveReady: () => reveal(index, { kind: 'live' }),
    onLiveError: error => setFailure({ message: error.message, stale: isStale(error) }),
    progress: state.playing && ready ? Math.min(1, slideTime / current.duration) : 0, slideTime,
    actions: {
      next: () => navigate(next), previous: () => navigate(previous),
      first: () => navigate((s, at) => goTo(s, 0, at)), last: () => navigate((s, at) => goTo(s, s.count - 1, at)),
      toggle: () => { setNow(clock()); setState(s => setPlaying(s, !s.playing, clock())) },
      toggleLoop: () => setState(s => setLoop(s, !s.loop)),
      restart: () => navigate((s, at) => goTo(s, 0, at)),
      replay: () => navigate((s, at) => goTo(s, s.index, at)),
      freeze: frozen => { const at = clock(); setNow(at); setState(s => setFrozen(s, frozen, at)) },
      refresh,
    },
  }
}
