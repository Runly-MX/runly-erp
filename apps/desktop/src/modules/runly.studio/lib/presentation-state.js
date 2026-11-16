// Presentation clock and navigation, pure and time-injected (no timers): the
// elapsed time of a slide is always `now - startedAt` plus what accumulated
// before a pause, so frames never drift by summing animation deltas.
export function startPresentation({ count, index = 0, now }) {
  return { count, index: Math.min(Math.max(0, index), count - 1), playing: false, loop: false, startedAt: now, elapsed: 0, direction: 1, ended: false }
}

export const elapsedOf = (state, now) => state.playing ? state.elapsed + Math.max(0, now - state.startedAt) : state.elapsed

// Slide change; direction drives the transition (1 forward, -1 back).
export function goTo(state, index, now) {
  const target = state.loop ? (index + state.count) % state.count : Math.min(Math.max(0, index), state.count - 1)
  if (target === state.index) return { ...state, startedAt: now, elapsed: 0, ended: false }
  const direction = index > state.index || (state.loop && index >= state.count) ? 1 : -1
  return { ...state, index: target, direction, startedAt: now, elapsed: 0, ended: false }
}
export const next = (state, now) => goTo(state, state.index + 1, now)
export const previous = (state, now) => goTo(state, state.index - 1, now)

export function setPlaying(state, playing, now) {
  if (playing === state.playing) return state
  if (!playing) return { ...state, playing: false, elapsed: elapsedOf(state, now) }
  // Playing again from a finished last slide restarts the presentation.
  if (state.ended) return { ...goTo(state, 0, now), playing: true }
  return { ...state, playing: true, startedAt: now }
}
export const setLoop = (state, loop) => ({ ...state, loop })

// The current slide starts counting only once its frame is visible.
export const restartClock = (state, now) => ({ ...state, startedAt: now, elapsed: 0 })

// Called on each animation frame while playing; advances when the slide is due.
export function advanceIfDue(state, now, duration) {
  if (!state.playing || elapsedOf(state, now) < duration) return state
  if (state.index < state.count - 1 || state.loop) return next(state, now)
  return { ...state, playing: false, elapsed: duration, ended: true }
}
