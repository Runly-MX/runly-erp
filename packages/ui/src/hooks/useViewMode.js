import { useCallback, useEffect, useRef, useState } from 'react'

// Three-step view cycle for immersive screens: normal -> clean (app chrome hidden,
// fixed overlay) -> fullscreen (clean + browser Fullscreen API). Where the Fullscreen
// API is missing (iOS Safari) the cycle skips straight back to normal.
const supportsFullscreen = () => typeof document !== 'undefined' && Boolean(document.documentElement?.requestFullscreen)

export function useViewMode() {
  const [mode, setModeState] = useState('normal')
  const modeRef = useRef(mode)
  modeRef.current = mode

  const setMode = useCallback((next) => {
    setModeState(next)
    if (typeof document === 'undefined') return
    if (next === 'fullscreen') {
      if (!document.fullscreenElement) document.documentElement.requestFullscreen?.().catch(() => setModeState('clean'))
    } else if (document.fullscreenElement) {
      document.exitFullscreen?.().catch(() => {})
    }
  }, [])

  // Cycle must run inside a user gesture (click) so requestFullscreen is allowed.
  const cycle = useCallback(() => {
    const current = modeRef.current
    if (current === 'normal') setMode('clean')
    else if (current === 'clean') setMode(supportsFullscreen() ? 'fullscreen' : 'normal')
    else setMode('normal')
  }, [setMode])

  // Esc: step down one level (fullscreen -> clean -> normal).
  const stepBack = useCallback(() => {
    const current = modeRef.current
    if (current === 'fullscreen') setMode('clean')
    else if (current === 'clean') setMode('normal')
  }, [setMode])

  // The browser can leave fullscreen on its own (Esc, F11): fall back to clean.
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement && modeRef.current === 'fullscreen') setModeState('clean')
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  // Leaving the screen must not strand the browser in fullscreen.
  useEffect(() => () => {
    if (typeof document !== 'undefined' && document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
  }, [])

  return { mode, isImmersive: mode !== 'normal', isFullscreen: mode === 'fullscreen', setMode, cycle, stepBack }
}
