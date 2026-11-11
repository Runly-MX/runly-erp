// Shared look of the Mercado template blocks: theme tokens with safe fallbacks, a line-icon set and small helpers.
import { useEffect, useRef, useState } from 'react'

export const GREEN = 'var(--runly-color-primary, #14432F)'
export const ON_GREEN = 'var(--runly-color-primaryFg, #FFFFFF)'
export const PAPER = 'var(--runly-color-bg, #F6F5F0)'
export const INK = 'var(--runly-color-fg, #15241C)'
export const MUTED = 'var(--runly-color-muted, #5D6A62)'
export const SALE = 'var(--runly-color-accent, #D9482B)'
export const SERIF = "var(--runly-font-serif, 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif)"
export const SANS = 'var(--runly-font-sans, Inter, system-ui, sans-serif)'
export const LINE = 'rgba(21,36,28,.1)'
export const CARD = '#FFFFFF'

export const safeHref = (value) => (/^(https?:|mailto:|tel:|\/|#|\?)/i.test(String(value ?? '').trim()) ? String(value).trim() : '#')
export const safeImg = (src) => (typeof src === 'string' && /^(https?:|\/|data:image\/)/i.test(src) ? src : '')
// "a | b | c" per line -> [['a','b','c'], ...]
export const rows = (raw, max = 12) => String(raw ?? '').split('\n').map((l) => l.split('|').map((p) => p.trim())).filter(([a]) => a).slice(0, max)

export const ICON_NAMES = ['tv', 'moda', 'hogar', 'belleza', 'deporte', 'juguetes', 'libros', 'mascotas', 'todo', 'envio', 'devolucion', 'candado', 'soporte', 'escudo', 'etiqueta', 'clientes', 'regalo', 'hoja', 'bolsa', 'reloj', 'sofa', 'audio']

const P = {
  tv: <><rect x="3" y="5" width="18" height="12" rx="2" /><path d="M8 21h8M12 17v4" /></>,
  moda: <path d="M9 3h6l-1.5 4L18 21H6l4.5-14zM9 3c0 1.7 1.3 3 3 3s3-1.3 3-3" />,
  hogar: <path d="M3 11 12 4l9 7M5 10v10h14V10M10 20v-5h4v5" />,
  belleza: <path d="M10 2h4v4h-4zM9 6h6v3l1 2v10H8V11l1-2zM8 14h8" />,
  deporte: <><circle cx="12" cy="12" r="9" /><path d="M3.5 9h17M3.5 15h17M12 3c-3 3-3 15 0 18M12 3c3 3 3 15 0 18" /></>,
  juguetes: <path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5l-5.3 2.9 1.2-6-4.5-4.1 6-.7z" />,
  libros: <path d="M4 19V5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2 2 2 0 0 0 2 2h13M8 7h7" />,
  mascotas: <><circle cx="6" cy="10" r="2" /><circle cx="10" cy="5.5" r="2" /><circle cx="14" cy="5.5" r="2" /><circle cx="18" cy="10" r="2" /><path d="M12 12c-3 0-5.5 3.5-5.5 6 0 2 1.5 2.5 3 2.5 1 0 1.5-.5 2.5-.5s1.5.5 2.5.5c1.5 0 3-.5 3-2.5 0-2.5-2.5-6-5.5-6z" /></>,
  todo: <><circle cx="7" cy="7" r="3" /><circle cx="17" cy="7" r="3" /><circle cx="7" cy="17" r="3" /><circle cx="17" cy="17" r="3" /></>,
  envio: <><path d="M2 6h12v10H2zM14 9h4l4 4v3h-8z" /><circle cx="6" cy="18" r="2" /><circle cx="18" cy="18" r="2" /></>,
  devolucion: <path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v4h4M12 8v4l3 2" />,
  candado: <><rect x="5" y="10" width="14" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3" /></>,
  soporte: <path d="M4 14v-2a8 8 0 0 1 16 0v2M4 14h3v5H5a1 1 0 0 1-1-1zM20 14h-3v5h2a1 1 0 0 0 1-1zM17 19c0 1.5-2 2-4 2" />,
  escudo: <path d="M12 3l8 3v6c0 4.5-3.4 8-8 9-4.6-1-8-4.5-8-9V6zM9 12l2 2 4-4" />,
  etiqueta: <><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="8.5" r="1.5" /></>,
  clientes: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c2 .7 3.2 2.5 3.6 5.4" /></>,
  regalo: <path d="M4 10h16v11H4zM3 7h18v3H3zM12 7v14M12 7c-2-4-6-4-6-1.5S9 7 12 7c3 0 6-.5 6-2.5S14 3 12 7" />,
  hoja: <path d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15zM5 19l7-7" />,
  bolsa: <path d="M5 8h14l-1 13H6zM9 8V6a3 3 0 0 1 6 0v2" />,
  reloj: <><circle cx="12" cy="12" r="6" /><path d="M9 6.5 9.5 2h5l.5 4.5M9 17.5 9.5 22h5l.5-4.5M12 9.5V12l1.5 1.5" /></>,
  sofa: <path d="M5 11V8a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v3M3 13a2 2 0 0 1 4 0v2h10v-2a2 2 0 0 1 4 0v5H3zM5 18v2M19 18v2" />,
  audio: <path d="M4 15v-3a8 8 0 0 1 16 0v3M4 15h3v6H5a1 1 0 0 1-1-1zM20 15h-3v6h2a1 1 0 0 0 1-1z" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1-4.5 4.2-7 8-7s7 2.5 8 7" /></>,
  heart: <path d="M12 20s-8-4.7-8-10.5A4.5 4.5 0 0 1 12 7a4.5 4.5 0 0 1 8 2.5C20 15.3 12 20 12 20z" />,
  cart: <><path d="M3 4h2.5l2.2 11h10.6L20.5 7H7" /><circle cx="9" cy="19.5" r="1.5" /><circle cx="17" cy="19.5" r="1.5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  close: <path d="M6 6l12 12M18 6 6 18" />,
  left: <path d="m15 6-6 6 6 6" />,
  right: <path d="m9 6 6 6-6 6" />,
  arrow: <path d="M5 12h14M13 6l6 6-6 6" />,
  mail: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6 8.5 7 8.5-7" /></>,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  pause: <path d="M9 6v12M15 6v12" />,
  play: <path d="M8 5.5v13l10-6.5z" />,
  phone: <><rect x="7" y="2.5" width="10" height="19" rx="2.5" /><path d="M11 18.5h2" /></>,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" /></>,
  facebook: <path d="M14 8h3V4.5h-3a4 4 0 0 0-4 4V11H7.5v3.5H10V21h3.5v-6.5H16l.5-3.5h-3V8.5A.5.5 0 0 1 14 8z" />,
  instagram: <><rect x="3.5" y="3.5" width="17" height="17" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.2" cy="6.8" r=".6" /></>,
  x: <path d="M4 4l16 16M20 4 4 20" />,
  youtube: <><rect x="2.5" y="5.5" width="19" height="13" rx="4" /><path d="m10 9 5 3-5 3z" /></>,
  tiktok: <path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5M14 3c.5 2.7 2.3 4.5 5 4.8" />,
}

export function Icon({ name, size = 24, stroke = 1.6, style }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flex: 'none', ...style }}>
      {P[name] ?? P.etiqueta}
    </svg>
  )
}

export function Stars({ value = 5, size = 14 }) {
  const full = Math.max(0, Math.min(5, Math.round(Number(value) || 0)))
  return (
    <span aria-label={`${full} de 5 estrellas`} style={{ display: 'inline-flex', gap: 2, color: '#E8A317' }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5l-5.3 2.9 1.2-6-4.5-4.1 6-.7z" fill={i < full ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></svg>
      ))}
    </span>
  )
}

// Elements below the fold start hidden and animate in when they scroll into view; the server render and anything
// already on screen stay visible, so a failed hydration never leaves content hidden.
export function useInView() {
  const ref = useRef(null)
  const [state, setState] = useState('idle')
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return undefined
    if (el.getBoundingClientRect().top < window.innerHeight) return undefined
    setState('wait')
    const io = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) { setState('in'); io.disconnect() } }, { rootMargin: '0px 0px -10% 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, state]
}

// Horizontal snap rail with previous/next buttons.
export function useRail() {
  const ref = useRef(null)
  const scroll = (dir) => {
    const el = ref.current
    if (!el) return
    const smooth = !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    el.scrollBy({ left: dir * Math.max(240, el.clientWidth * 0.85), behavior: smooth ? 'smooth' : 'auto' })
  }
  return [ref, scroll]
}

export const BASE_CSS = `.mk a:focus-visible,.mk button:focus-visible,.mk input:focus-visible{outline:3px solid ${SALE};outline-offset:2px}
.mk-stagger[data-in="wait"]>*{opacity:0;transform:translateY(18px)}
.mk-stagger[data-in="in"]>*{animation:mk-rise .6s cubic-bezier(.2,.7,.2,1) both}
${Array.from({ length: 10 }, (_, i) => `.mk-stagger[data-in="in"]>*:nth-child(${i + 1}){animation-delay:${i * 70}ms}`).join('')}
@keyframes mk-rise{from{opacity:0;transform:translateY(18px)}to{opacity:1;transform:none}}
.mk-rail{display:grid;grid-auto-flow:column;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;overscroll-behavior-x:contain}
.mk-rail::-webkit-scrollbar{display:none}.mk-rail>*{scroll-snap-align:start}
.mk-round{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:999px;border:1px solid ${LINE};background:#fff;color:${INK};cursor:pointer;box-shadow:0 6px 18px rgba(21,36,28,.1);transition:transform .2s ease,background .2s ease,color .2s ease}
.mk-round:hover{background:${GREEN};color:${ON_GREEN};transform:scale(1.06)}
@media (max-width:767px){.mk-arrow{display:none!important}}
.mk-link{display:inline-flex;align-items:center;gap:6px;color:${INK};font-family:${SANS};font-size:14px;font-weight:600;text-decoration:none;min-height:44px}
.mk-link svg{transition:transform .2s ease}.mk-link:hover svg{transform:translateX(4px)}
@media (prefers-reduced-motion:reduce){.mk *,.mk *::before,.mk *::after{animation:none!important;transition:none!important}}`

export const Base = () => <style>{BASE_CSS}</style>

export const panel = { maxWidth: 1280, marginInline: 'auto', background: CARD, borderRadius: 20, boxShadow: '0 1px 2px rgba(21,36,28,.04), 0 10px 30px rgba(21,36,28,.05)' }
export const sectionPad = { padding: '12px clamp(12px, 3vw, 24px)', background: PAPER }
export const h2 = { margin: 0, fontFamily: SERIF, fontWeight: 500, fontSize: 'clamp(24px, 2.6vw, 32px)', lineHeight: 1.15, letterSpacing: '-0.01em', color: INK }
