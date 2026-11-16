import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button, cn } from '@runly/ui'
import { AlertTriangle, ChevronLeft, ChevronRight, Loader2, Pause, Play, RefreshCw, Repeat, X } from 'lucide-react'
import { usePresentation } from './usePresentation.js'

const HIDE_AFTER = 2500, SWIPE = 48
const reducedMotionQuery = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Full-screen slide player. Uses the Fullscreen API on its own element when
// available and stays a fixed full-viewport layer otherwise (iPhone, webviews).
// Nothing inside portals out: native fullscreen only shows this subtree.
export function PresentationOverlay({ editor, startPageId, title, onClose }) {
  const root = useRef(null), stageRef = useRef(null), returnFocus = useRef(null), pointer = useRef(null)
  const [stage, setStage] = useState(null), [chrome, setChrome] = useState(true), [reducedMotion] = useState(reducedMotionQuery)
  const player = usePresentation({ editor, startPageId, stage, reducedMotion })
  const { actions, state, index, pages, layers, failure } = player
  const closeRef = useRef(onClose)
  closeRef.current = onClose

  useLayoutEffect(() => {
    returnFocus.current = document.activeElement
    const element = root.current
    element.focus()
    let entered = false
    const onFullscreen = () => {
      if (document.fullscreenElement === element) entered = true
      else if (entered) closeRef.current()
    }
    document.addEventListener('fullscreenchange', onFullscreen)
    element.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => {})
    return () => {
      document.removeEventListener('fullscreenchange', onFullscreen)
      if (document.fullscreenElement === element) document.exitFullscreen?.().catch(() => {})
      returnFocus.current?.focus?.()
    }
  }, [])

  // Stage size in 32 px steps: frames re-render on rotation, not on every pixel.
  useEffect(() => {
    const element = stageRef.current
    const measure = () => setStage(previous => {
      const next = { width: Math.max(64, Math.round(element.clientWidth / 32) * 32), height: Math.max(64, Math.round(element.clientHeight / 32) * 32) }
      return previous && previous.width === next.width && previous.height === next.height ? previous : next
    })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  // Controls hide after inactivity while the slide is shown; focus inside them keeps them.
  const hideTimer = useRef(null)
  const wake = () => {
    setChrome(true)
    clearTimeout(hideTimer.current)
    hideTimer.current = setTimeout(() => { if (!root.current?.querySelector('[data-controls]')?.contains(document.activeElement)) setChrome(false) }, HIDE_AFTER)
  }
  useEffect(() => { wake(); return () => clearTimeout(hideTimer.current) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function onKeyDown(event) {
    // The player owns the keyboard: nothing reaches the editor shortcuts underneath.
    event.stopPropagation()
    wake()
    if (event.key === 'Tab') { trapFocus(event); return }
    if (event.target.closest('button') && (event.key === 'Enter' || event.key === ' ')) return
    const action = {
      ArrowRight: actions.next, ArrowDown: actions.next, PageDown: actions.next, ' ': actions.next, Enter: actions.next,
      ArrowLeft: actions.previous, ArrowUp: actions.previous, PageUp: actions.previous, Backspace: actions.previous,
      Home: actions.first, End: actions.last, k: actions.toggle, K: actions.toggle, l: actions.toggleLoop, L: actions.toggleLoop, Escape: onClose,
    }[event.key]
    if (!action) return
    event.preventDefault()
    action()
  }
  function trapFocus(event) {
    const focusable = [...root.current.querySelectorAll('button:not([disabled])')]
    if (!focusable.length) { event.preventDefault(); return }
    const first = focusable[0], last = focusable.at(-1)
    if (event.shiftKey && (document.activeElement === first || document.activeElement === root.current)) { event.preventDefault(); last.focus() }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
  }
  // Mouse: right half advances, left half goes back. Touch: swipe navigates, tap shows the controls.
  function onPointerDown(event) { if (event.isPrimary) pointer.current = { x: event.clientX, y: event.clientY, type: event.pointerType } }
  function onPointerUp(event) {
    const start = pointer.current
    pointer.current = null
    if (!start || event.target.closest('[data-controls]')) return
    wake()
    const dx = event.clientX - start.x, dy = event.clientY - start.y
    if (start.type === 'touch' || start.type === 'pen') {
      if (Math.abs(dx) > SWIPE && Math.abs(dx) > Math.abs(dy)) (dx < 0 ? actions.next : actions.previous)()
      return
    }
    if (event.button !== 0 || Math.hypot(dx, dy) > 8) return
    const box = stageRef.current.getBoundingClientRect()
    ;(event.clientX >= box.left + box.width / 2 ? actions.next : actions.previous)()
  }

  const page = pages[index]?.page
  const fit = stage && page ? Math.min(stage.width / page.width, stage.height / page.height) : 0
  const slideStyle = (layer, scene) => {
    const size = scene && stage ? Math.min(stage.width / scene.page.width, stage.height / scene.page.height) : fit
    return { width: (scene?.page.width ?? 0) * size, height: (scene?.page.height ?? 0) * size, opacity: layer.opacity,
      transform: `translate(${layer.dx * 100}%, ${layer.dy * 100}%) scale(${layer.scale})` }
  }
  const counter = `${index + 1} / ${pages.length}`
  const iconButton = 'h-11 w-11 shrink-0 rounded-md text-white hover:bg-white/15 hover:text-white focus-visible:ring-white'

  return (
    <div ref={root} role="dialog" aria-modal="true" aria-label={`Presentación: ${title}`} tabIndex={-1}
      onKeyDown={onKeyDown} onPointerMove={event => { if (event.pointerType === 'mouse') wake() }}
      className={cn('fixed inset-0 z-[60] flex h-dvh flex-col bg-black text-white outline-none', !chrome && 'cursor-none')}>
      <p aria-live="polite" className="sr-only">{`Diapositiva ${index + 1} de ${pages.length}`}</p>
      {state.playing ? (
        <div className="absolute inset-x-0 top-0 z-10 h-1 bg-white/15" aria-hidden>
          <div className="h-full bg-fuchsia-500" style={{ width: `${player.progress * 100}%` }} />
        </div>
      ) : null}
      <div ref={stageRef} onPointerDown={onPointerDown} onPointerUp={onPointerUp} className="relative min-h-0 flex-1 touch-none select-none overflow-hidden">
        {[layers.outgoing, layers.incoming].map((layer, order) => layer ? (
          // While the next slide renders, the previous one is dimmed so it never reads as the current slide.
          <div key={`${order}:${layer.index}`} className={cn('absolute inset-0 flex items-center justify-center', !player.ready && 'opacity-40')}>
            <img src={layer.url} alt={order ? `Diapositiva ${layer.index + 1}` : ''} aria-hidden={order ? undefined : true} draggable={false}
              className="max-w-none" style={slideStyle(layer, pages[layer.index])} />
          </div>
        ) : null)}
        {!player.ready && !failure ? (
          <div className="absolute inset-0 flex items-center justify-center" role="status">
            <Loader2 className="h-8 w-8 animate-spin text-white/70 motion-reduce:animate-none" aria-hidden />
            <span className="sr-only">Preparando diapositiva</span>
          </div>
        ) : null}
        {failure ? (
          <div data-controls className="absolute inset-x-4 top-4 z-20 mx-auto flex max-w-lg items-start gap-3 rounded-md bg-white p-3 text-sm text-neutral-900 shadow-lg">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{failure.stale ? 'El diseño cambió mientras presentabas.' : 'No se pudo mostrar esta diapositiva.'}</p>
              {!failure.stale ? <p className="mt-0.5 text-neutral-600">{failure.message}</p> : null}
            </div>
            <Button type="button" size="sm" variant="outline" className="shrink-0 gap-1.5" onClick={actions.refresh}><RefreshCw className="h-4 w-4" aria-hidden />Actualizar</Button>
          </div>
        ) : null}
      </div>
      <div data-controls onFocus={wake}
        className={cn('absolute inset-x-0 bottom-0 z-20 flex justify-center px-3 pb-[max(0.75rem,var(--sab))] transition-opacity duration-200 motion-reduce:transition-none',
          chrome ? 'opacity-100' : 'pointer-events-none opacity-0')}>
        <div className="flex items-center gap-1 rounded-lg bg-neutral-900/85 p-1 shadow-lg backdrop-blur">
          <Button type="button" variant="ghost" size="icon" className={iconButton} aria-label="Diapositiva anterior" title="Anterior (←)"
            disabled={!state.loop && index === 0} onClick={actions.previous}><ChevronLeft className="h-5 w-5" /></Button>
          <Button type="button" variant="ghost" size="icon" className={iconButton} aria-label={state.playing ? 'Pausar' : 'Reproducir automáticamente'} title={state.playing ? 'Pausar (K)' : 'Reproducir (K)'}
            onClick={actions.toggle}>{state.playing ? <Pause className="h-5 w-5" /> : <Play className="h-5 w-5" />}</Button>
          <Button type="button" variant="ghost" size="icon" className={iconButton} aria-label="Diapositiva siguiente" title="Siguiente (→)"
            disabled={!state.loop && index === pages.length - 1} onClick={actions.next}><ChevronRight className="h-5 w-5" /></Button>
          <span className="min-w-14 px-2 text-center text-sm tabular-nums text-white/85">{counter}</span>
          <Button type="button" variant="ghost" size="icon" className={cn(iconButton, state.loop && 'bg-white/20')} aria-label="Repetir al terminar" aria-pressed={state.loop} title="Repetir (L)"
            onClick={actions.toggleLoop}><Repeat className="h-5 w-5" /></Button>
          <span aria-hidden className="mx-1 h-6 w-px bg-white/20" />
          <Button type="button" variant="ghost" size="icon" className={iconButton} aria-label="Salir de la presentación" title="Salir (Esc)" onClick={onClose}><X className="h-5 w-5" /></Button>
        </div>
      </div>
    </div>
  )
}
