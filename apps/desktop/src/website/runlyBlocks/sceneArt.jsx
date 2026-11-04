import { useEffect } from 'react'

// Layered landscape illustrations (travel-poster style) generated from a few numbers: no image files, so they publish
// as plain markup. Each layer is its own SVG so the layers can drift at different speeds (depth parallax).
const W = 1200
const H = 600

function ridge({ kind, base, amp, wave, seed }) {
  let path = `M0 ${H}`
  if (kind === 'pines') {
    for (let x = -20; x <= W + 20; x += 34) {
      const h = amp * (0.7 + 0.3 * Math.abs(Math.sin(x * 0.05 + seed)) + 0.25 * Math.abs(Math.sin(x * 0.013 + seed * 2)))
      path += ` L${x} ${base} L${x + 17} ${(base - h).toFixed(1)} L${x + 34} ${base}`
    }
    return `${path} L${W} ${H} Z`
  }
  for (let x = 0; x <= W; x += 12) {
    const t = x * wave + seed
    const y = kind === 'peaks'
      ? base - amp * (1 - Math.abs(Math.sin(t)) * 0.9) * (0.7 + 0.3 * Math.sin(t * 0.37 + seed))
      : base - amp * (0.6 * Math.sin(t) + 0.3 * Math.sin(t * 2.3 + seed * 1.7) + 0.1 * Math.sin(t * 5.1 + seed))
    path += ` L${x} ${y.toFixed(1)}`
  }
  return `${path} L${W} ${H} Z`
}

// sky: top, middle, horizon. sun: position in % of the frame. layers: back to front; speed is px of drift per px of
// scroll offset (front layers move more, which is what reads as depth).
export const SCENES = {
  ocean: {
    sky: ['#0B1B2B', '#0E7490', '#FDBA74'], sun: { x: 78, y: 40, r: 9, color: '#FEF3C7' },
    layers: [
      { kind: 'waves', base: 330, amp: 26, wave: 0.011, seed: 1, color: '#0F8CA3', speed: 0.02 },
      { kind: 'waves', base: 400, amp: 30, wave: 0.014, seed: 2.4, color: '#0B6F8A', speed: 0.05 },
      { kind: 'waves', base: 470, amp: 34, wave: 0.017, seed: 4.1, color: '#08516B', speed: 0.09 },
      { kind: 'waves', base: 540, amp: 30, wave: 0.02, seed: 5.3, color: '#05364D', speed: 0.14 },
    ],
  },
  mountains: {
    sky: ['#1E1B4B', '#BE185D', '#FB923C'], sun: { x: 78, y: 34, r: 8, color: '#FFEDD5' },
    layers: [
      { kind: 'peaks', base: 360, amp: 150, wave: 0.0065, seed: 1.2, color: '#9D3A78', speed: 0.02 },
      { kind: 'peaks', base: 430, amp: 150, wave: 0.0085, seed: 3.6, color: '#6B2A73', speed: 0.05 },
      { kind: 'peaks', base: 500, amp: 140, wave: 0.011, seed: 5.2, color: '#3F2268', speed: 0.09 },
      { kind: 'waves', base: 570, amp: 24, wave: 0.016, seed: 2, color: '#1E1B4B', speed: 0.14 },
    ],
  },
  desert: {
    sky: ['#7C2D12', '#EA580C', '#FDE68A'], sun: { x: 80, y: 34, r: 9, color: '#FFFBEB' },
    layers: [
      { kind: 'waves', base: 380, amp: 40, wave: 0.0055, seed: 0.6, color: '#C2410C', speed: 0.02 },
      { kind: 'waves', base: 450, amp: 46, wave: 0.0075, seed: 2.9, color: '#9A3412', speed: 0.05 },
      { kind: 'waves', base: 520, amp: 44, wave: 0.0095, seed: 4.8, color: '#7C2D12', speed: 0.09 },
      { kind: 'waves', base: 580, amp: 28, wave: 0.013, seed: 1.7, color: '#431407', speed: 0.14 },
    ],
  },
  forest: {
    sky: ['#052E16', '#166534', '#D9F99D'], sun: { x: 80, y: 32, r: 7, color: '#ECFCCB' },
    layers: [
      { kind: 'peaks', base: 380, amp: 120, wave: 0.006, seed: 2.2, color: '#3F8F4F', speed: 0.02 },
      { kind: 'pines', base: 430, amp: 90, wave: 0, seed: 1.1, color: '#2A7A41', speed: 0.05 },
      { kind: 'pines', base: 500, amp: 120, wave: 0, seed: 3.3, color: '#14532D', speed: 0.09 },
      { kind: 'pines', base: 585, amp: 150, wave: 0, seed: 5.5, color: '#052E16', speed: 0.14 },
    ],
  },
}

const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value))

// Moves every [data-drift] descendant by (scroll offset x its speed) while the root is on screen. Passive, rAF
// throttled, only listening while visible, and inert with prefers-reduced-motion.
export function useDriftLayers(rootRef, strength = 1) {
  useEffect(() => {
    const root = rootRef.current
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!root || reduced || typeof IntersectionObserver === 'undefined') return undefined
    const layers = [...root.querySelectorAll('[data-drift]')]
    let raf = 0
    let listening = false
    const update = () => {
      raf = 0
      const rect = root.getBoundingClientRect()
      const offset = rect.top + rect.height / 2 - window.innerHeight / 2
      for (const layer of layers) layer.style.transform = `translate3d(0, ${Math.round(clamp(offset * Number(layer.dataset.drift) * strength, rect.height * 0.14))}px, 0)`
    }
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update) }
    const listen = (on) => {
      if (on === listening) return
      listening = on
      const fn = on ? 'addEventListener' : 'removeEventListener'
      window[fn]('scroll', onScroll, { passive: true })
      window[fn]('resize', onScroll, { passive: true })
      if (on) update()
    }
    const observer = new IntersectionObserver(([entry]) => listen(entry.isIntersecting))
    observer.observe(root)
    return () => { observer.disconnect(); listen(false); if (raf) cancelAnimationFrame(raf) }
  }, [rootRef, strength])
}

// The illustration itself: sky, sun and layers filling its positioned parent. Drift speeds are read by
// useDriftLayers on the parent (or an ancestor) through data-drift.
export function SceneArt({ scene }) {
  const art = SCENES[scene] ?? SCENES.mountains
  return (
    <div aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', background: `linear-gradient(180deg, ${art.sky[0]} 0%, ${art.sky[1]} 55%, ${art.sky[2]} 100%)` }}>
      <div data-drift="-0.04" style={{ position: 'absolute', left: `${art.sun.x - art.sun.r}%`, top: `${art.sun.y}%`, width: `${art.sun.r * 2}%`, aspectRatio: '1', willChange: 'transform' }}>
        <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: art.sun.color, boxShadow: `0 0 90px 30px ${art.sun.color}55` }} />
      </div>
      {art.layers.map((layer, index) => (
        <svg key={index} data-drift={layer.speed} viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMax slice" style={{ position: 'absolute', left: 0, right: 0, bottom: '-8%', height: '116%', width: '100%', willChange: 'transform' }}>
          <path d={ridge(layer)} fill={layer.color} />
        </svg>
      ))}
    </div>
  )
}
