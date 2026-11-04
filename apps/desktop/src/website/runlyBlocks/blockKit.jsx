import { useEffect, useRef, useState } from 'react'

// Building blocks shared by the hand-made template blocks (Impulsa, Aura): text-prop parsing, reveal-on-scroll,
// count-up, pointer and scroll variables, and a small line-icon set. Motion is opt-in after hydration and every hook
// is a no-op under reduced motion, so server-rendered content is always complete and visible.

export const lines = (raw) => String(raw ?? '').split('\n').map((line) => line.trim()).filter(Boolean)
export const cells = (raw) => lines(raw).map((line) => line.split('|').map((part) => part.trim()))
export const safeHref = (value) => (/^(https?:|mailto:|tel:|\/|#)/i.test(value ?? '') ? value : '#')
export const reduced = () => typeof window === 'undefined' || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Marks the element as "wait" after hydration and flips it to "in" once it enters the viewport.
export function useReveal(threshold = 0.18) {
  const ref = useRef(null)
  const [state, setState] = useState('static')
  useEffect(() => {
    const el = ref.current
    if (!el || reduced() || typeof IntersectionObserver === 'undefined') return undefined
    setState('wait')
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setState('in'); observer.disconnect() } }, { threshold, rootMargin: '0px 0px -8% 0px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold])
  return [ref, state]
}

// Counts from 0 to `value` once `active`; renders the final value until then so it is never wrong without JS.
export function CountUp({ value, decimals = 0, active, duration = 1600 }) {
  const [shown, setShown] = useState(value)
  useEffect(() => {
    if (!active || reduced()) { setShown(value); return undefined }
    let frame, start
    const step = (time) => {
      start ??= time
      const t = Math.min(1, (time - start) / duration)
      setShown(value * (1 - (1 - t) ** 3))
      if (t < 1) frame = requestAnimationFrame(step)
    }
    setShown(0); frame = requestAnimationFrame(step)
    return () => cancelAnimationFrame(frame)
  }, [active, value, duration])
  return <>{Number(shown).toLocaleString('es-MX', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</>
}

// Pointer-driven tilt/spotlight: writes --mx/--my (0..1) on the element. Only for fine pointers and full motion.
export function usePointerVars() {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el || reduced() || !window.matchMedia?.('(pointer: fine)').matches) return undefined
    let frame
    const move = (event) => {
      const rect = el.getBoundingClientRect()
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(() => { el.style.setProperty('--mx', ((event.clientX - rect.left) / rect.width).toFixed(3)); el.style.setProperty('--my', ((event.clientY - rect.top) / rect.height).toFixed(3)) })
    }
    const leave = () => { el.style.setProperty('--mx', '0.5'); el.style.setProperty('--my', '0.5') }
    el.addEventListener('pointermove', move); el.addEventListener('pointerleave', leave)
    return () => { cancelAnimationFrame(frame); el.removeEventListener('pointermove', move); el.removeEventListener('pointerleave', leave) }
  }, [])
  return ref
}


const PATHS = {
  arrow: 'M5 12h14M13 6l6 6-6 6',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  plus: 'M12 5v14M5 12h14',
  users: 'M16 20v-1.5a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4V20M9.5 10.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM21 20v-1.5a4 4 0 0 0-3-3.87M15.5 3.6a3.5 3.5 0 0 1 0 6.8',
  briefcase: 'M4 8h16v11H4zM9 8V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V8M4 13h16',
  chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6M20 16v-9',
  trend: 'M3 17l6-6 4 4 8-8M15 7h6v6',
  star: 'M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z',
  mail: 'M3.5 6h17v12h-17zM4 7l8 6 8-6',
  phone: 'M6.6 3.5h3l1.5 4-2 1.3a11 11 0 0 0 6 6l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2z',
  pin: 'M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2',
  search: 'M10.5 17a6.5 6.5 0 1 0 0-13 6.5 6.5 0 0 0 0 13zM20 20l-4.6-4.6',
  target: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 16.5a4.5 4.5 0 1 0 0-9 4.5 4.5 0 0 0 0 9zM12 12.5a.5.5 0 1 0 0-1 .5.5 0 0 0 0 1z',
  chat: 'M4 5h16v11H9l-5 4z',
  rocket: 'M12 3c3 2 5 5.5 5 9.5L15 15H9l-2-2.5C7 8.5 9 5 12 3zM9 15l-2.5 4M15 15l2.5 4M12 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3z',
  quote: 'M5 17c0-4 1.5-7 5-9l1 1.5C9 11 8.5 12.5 8.5 14H11v5H5zM13 17c0-4 1.5-7 5-9l1 1.5c-2 1.5-2.5 3-2.5 4.5H19v5h-6z',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  shield: 'M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3.5 12h17M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z',
  in: 'M5 9.5h3V19H5zM6.5 7a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM11 9.5h3v1.6c.6-1 1.8-1.8 3.4-1.8 2.4 0 3.6 1.5 3.6 4.4V19h-3v-4.8c0-1.4-.5-2.2-1.7-2.2s-2.3.9-2.3 2.4V19h-3z',
  fb: 'M14 8h2.5V4.5H14A3.5 3.5 0 0 0 10.5 8v2H8v3.5h2.5V21H14v-7.5h2.5L17 10h-3V8.5c0-.3.2-.5.5-.5z',
  x: 'M5 4l14 16M19 4L5 20',
  heart: 'M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z',
  moon: 'M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z',
  sparkle: 'M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  mic: 'M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3zM6 11.5a6 6 0 0 0 12 0M12 17.5V21',
  call: 'M6.6 3.5h3l1.5 4-2 1.3a11 11 0 0 0 6 6l1.3-2 4 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.6 5.7a2 2 0 0 1 2-2.2zM15 3.5a6 6 0 0 1 5.5 5.5',
  lock: 'M6 11h12v9H6zM8.5 11V8a3.5 3.5 0 0 1 7 0v3',
  leaf: 'M5 19c0-8 5-13 14-14 0 9-5 14-13 14zM5 19l7-7',
  device: 'M7 3h10v18H7zM11 18h2',
  bell: 'M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20.5a2 2 0 0 0 4 0',
  pulse: 'M3 12h4l2-5 4 10 2-5h6',
  ig: 'M7.5 3.5h9a4 4 0 0 1 4 4v9a4 4 0 0 1-4 4h-9a4 4 0 0 1-4-4v-9a4 4 0 0 1 4-4zM12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM17.3 6.7h.01',
}
export const ICON_NAMES = Object.keys(PATHS)
export const Icon = ({ name, size = 20, stroke = 2, color = 'currentColor', style }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" style={{ display: 'block', flexShrink: 0, ...style }}>
    <path d={PATHS[name] ?? PATHS.star} />
  </svg>
)

// Writes --sy (pixels scrolled past the element's top, clamped) on the element while it is on screen, for parallax.
export function useScrollVar(max = 800) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el || reduced()) return undefined
    let frame
    const update = () => { frame = 0; const top = el.getBoundingClientRect().top; el.style.setProperty('--sy', String(Math.max(-max, Math.min(max, -top)).toFixed(1))) }
    const onScroll = () => { if (!frame) frame = requestAnimationFrame(update) }
    update(); window.addEventListener('scroll', onScroll, { passive: true })
    return () => { window.removeEventListener('scroll', onScroll); cancelAnimationFrame(frame) }
  }, [max])
  return ref
}
