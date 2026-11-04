import { useEffect, useRef } from 'react'
import { defineBlock } from '@raulbellosom/atlas-web-builder'

const PRIMARY_DARK = 'color-mix(in srgb, var(--runly-color-primary, #2563eb) 55%, #000)'
// [gradient, content is dark text]
const TONES = {
  sky: ['linear-gradient(165deg, #0B1B2B 0%, #0E7490 100%)', false],
  sunset: ['linear-gradient(165deg, #1E1B4B 0%, #BE185D 55%, #F97316 100%)', false],
  forest: ['linear-gradient(165deg, #052E16 0%, #166534 100%)', false],
  ink: ['linear-gradient(165deg, #0F172A 0%, #334155 100%)', false],
  primary: [`linear-gradient(165deg, var(--runly-color-primary, #2563eb) 0%, ${PRIMARY_DARK} 100%)`, false],
  light: ['linear-gradient(165deg, #F8FAFC 0%, #E0F2FE 100%)', true],
}
const SHAPES = {
  circles: [
    { left: '6%', top: '8%', size: 300, color: 'var(--runly-color-accent, #f97316)', opacity: 0.28, factor: 0.5, round: '50%' },
    { left: '72%', top: '52%', size: 420, color: 'var(--runly-color-primary, #2563eb)', opacity: 0.3, factor: -0.35, round: '50%' },
    { left: '44%', top: '78%', size: 200, color: '#ffffff', opacity: 0.12, factor: 0.9, round: '50%' },
  ],
  rings: [
    { left: '8%', top: '12%', size: 260, color: 'transparent', border: '2px solid rgba(255,255,255,.35)', opacity: 0.6, factor: 0.5, round: '50%' },
    { left: '76%', top: '58%', size: 360, color: 'transparent', border: '2px solid var(--runly-color-accent, #f97316)', opacity: 0.5, factor: -0.4, round: '50%' },
    { left: '50%', top: '10%', size: 140, color: 'var(--runly-color-accent, #f97316)', opacity: 0.35, factor: 0.9, round: '50%' },
  ],
  blobs: [
    { left: '4%', top: '10%', size: 340, color: 'var(--runly-color-accent, #f97316)', opacity: 0.26, factor: 0.5, round: '58% 42% 55% 45% / 48% 55% 45% 52%' },
    { left: '70%', top: '48%', size: 440, color: 'var(--runly-color-primary, #2563eb)', opacity: 0.3, factor: -0.35, round: '45% 55% 40% 60% / 55% 45% 55% 45%' },
    { left: '42%', top: '80%', size: 220, color: '#ffffff', opacity: 0.12, factor: 0.9, round: '60% 40% 50% 50% / 45% 60% 40% 55%' },
  ],
}
const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value))

// Background and shapes drift at different speeds while the section scrolls through the viewport; the section
// clips them (overflow hidden), so nothing overlaps its neighbours. Listeners exist only while the section is on
// screen and not at all with prefers-reduced-motion.
function Layers({ gradient, shapes, speed }) {
  const root = useRef(null)
  useEffect(() => {
    const el = root.current
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!el || reduced || typeof IntersectionObserver === 'undefined') return undefined
    const layers = [...el.querySelectorAll('[data-parallax-factor]')]
    let raf = 0
    let listening = false
    const update = () => {
      raf = 0
      const rect = el.getBoundingClientRect()
      const offset = rect.top + rect.height / 2 - window.innerHeight / 2
      for (const layer of layers) layer.style.transform = `translate3d(0, ${Math.round(clamp(offset * speed * Number(layer.dataset.parallaxFactor), rect.height * 0.3))}px, 0)`
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
    observer.observe(el)
    return () => { observer.disconnect(); listen(false); if (raf) cancelAnimationFrame(raf) }
  }, [speed])

  return (
    <div ref={root} aria-hidden="true" style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
      <div data-parallax-factor="-1" style={{ position: 'absolute', inset: '-35% 0', background: gradient, willChange: 'transform' }} />
      {shapes.map((shape, index) => (
        <div key={index} data-parallax-factor={shape.factor} style={{ position: 'absolute', left: shape.left, top: shape.top, width: shape.size, height: shape.size, borderRadius: shape.round, background: shape.color, border: shape.border, opacity: shape.opacity, filter: shape.border ? undefined : 'blur(2px)', willChange: 'transform' }} />
      ))}
    </div>
  )
}

export const ParallaxSectionBlock = defineBlock({
  type: 'ParallaxSectionBlock',
  label: 'Sección con parallax',
  category: 'atlas',
  slots: { children: {} },
  defaultProps: { tone: 'sky', shapes: 'circles', speed: '0.2', paddingY: '16', minHeight: '', align: 'center' },
  fields: {
    tone: { type: 'select', label: 'Color de fondo', options: [{ value: 'sky', label: 'Cielo' }, { value: 'sunset', label: 'Atardecer' }, { value: 'forest', label: 'Bosque' }, { value: 'ink', label: 'Tinta' }, { value: 'primary', label: 'Color principal' }, { value: 'light', label: 'Claro' }] },
    shapes: { type: 'select', label: 'Formas flotantes', options: [{ value: 'circles', label: 'Círculos' }, { value: 'rings', label: 'Anillos' }, { value: 'blobs', label: 'Manchas' }, { value: 'none', label: 'Ninguna' }] },
    speed: { type: 'select', label: 'Intensidad del movimiento', options: [{ value: '0.1', label: 'Suave' }, { value: '0.2', label: 'Media' }, { value: '0.3', label: 'Fuerte' }] },
    paddingY: { type: 'select', label: 'Espacio vertical', options: ['8', '12', '16', '24'].map((value) => ({ value, label: value })) },
    minHeight: { type: 'select', label: 'Altura mínima', options: [{ value: '', label: 'Automática' }, { value: '360px', label: '360 px' }, { value: '480px', label: '480 px' }, { value: '600px', label: '600 px' }] },
    align: { type: 'select', label: 'Alineación del contenido', options: [{ value: 'center', label: 'Centrado' }, { value: 'left', label: 'Izquierda' }] },
  },
  groups: [{ label: 'Estilo', fields: ['tone', 'shapes', 'speed'] }, { label: 'Disposición', fields: ['paddingY', 'minHeight', 'align'] }],
  render({ tone, shapes, speed, paddingY, minHeight, align, ctx }) {
    const [gradient] = TONES[tone] ?? TONES.sky
    return (
      <section style={{ position: 'relative', overflow: 'hidden', minHeight: minHeight || undefined, display: 'flex', alignItems: 'center', padding: `${Number(paddingY) * 4}px 24px` }}>
        <Layers gradient={gradient} shapes={SHAPES[shapes] ?? []} speed={Number(speed) || 0.2} />
        <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '1100px', marginInline: 'auto', textAlign: align === 'left' ? 'left' : 'center' }}>{ctx.slot('children')}</div>
      </section>
    )
  },
})
