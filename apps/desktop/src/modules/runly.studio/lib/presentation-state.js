// Presentation clock and navigation, pure and time-injected (no timers). One clock per
// shown slide drives everything visible: object animations, the entry transition,
// autoplay and the progress bar. Its time is always `now - startedAt` plus what
// accumulated before a pause, so frames never drift by summing animation deltas, and
// pausing freezes the whole stage (transition included) at exactly that instant.
// `playing` only decides whether the slide advances by itself when its time is up.
const fresh = now => ({ motionStartedAt: now, motionElapsed: 0, frozen: false })
export function startPresentation({ count, index = 0, now }) {
  return { count, index: Math.min(Math.max(0, index), count - 1), playing: false, loop: false, direction: 1, ended: false, ...fresh(now) }
}
export const motionTime = (state, now) => state.frozen ? state.motionElapsed : state.motionElapsed + Math.max(0, now - state.motionStartedAt)
// Kept for callers that read the autoplay clock: it is the same clock.
export const elapsedOf = motionTime

// Slide change; direction drives the transition (1 forward, -1 back).
export function goTo(state, index, now) {
  const target = state.loop ? (index + state.count) % state.count : Math.min(Math.max(0, index), state.count - 1)
  if (target === state.index) return { ...state, ...fresh(now), ended: false }
  const direction = index > state.index || (state.loop && index >= state.count) ? 1 : -1
  return { ...state, index: target, direction, ...fresh(now), ended: false }
}
export const next = (state, now) => goTo(state, state.index + 1, now)
export const previous = (state, now) => goTo(state, state.index - 1, now)

// Pause freezes the clock; play resumes it from the same instant and turns autoplay on.
export function setPlaying(state, playing, now) {
  if (playing === state.playing && (playing ? !state.frozen : state.frozen)) return state
  if (!playing) return { ...state, playing: false, frozen: true, motionElapsed: motionTime(state, now) }
  // Playing again from a finished last slide restarts the presentation.
  if (state.ended) return { ...goTo(state, 0, now), playing: true }
  return { ...state, playing: true, frozen: false, motionElapsed: motionTime(state, now), motionStartedAt: now }
}
export const setLoop = (state, loop) => ({ ...state, loop })
// Freeze or thaw the stage without touching autoplay (recording pause, hidden tab).
export function setFrozen(state, frozen, now) {
  if (frozen === state.frozen) return state
  return frozen ? { ...state, frozen: true, motionElapsed: motionTime(state, now) } : { ...state, frozen: false, motionStartedAt: now }
}

// The current slide starts counting only once its frame is visible.
export const restartClock = (state, now) => ({ ...state, ...fresh(now) })

// Called on each animation frame while playing; advances when the slide is due.
export function advanceIfDue(state, now, duration) {
  if (!state.playing || state.frozen || motionTime(state, now) < duration) return state
  if (state.index < state.count - 1 || state.loop) return next(state, now)
  return { ...state, playing: false, frozen: true, motionElapsed: duration, ended: true }
}
