import { useEffect, useRef } from 'react'

// Animated backdrop for the Studio hero: drifting colour glows plus floating
// "dust" that twinkles and gently avoids the pointer. Pure canvas (no deps).
// Pauses off-screen / in hidden tabs; prefers-reduced-motion paints one still frame.
const COLORS = [[217, 70, 239], [139, 92, 246], [56, 189, 248], [244, 114, 182]]
const BLOBS = [
  { color: COLORS[0], radius: 0.55, x: [0.88, 0.12], y: [0.05, 0.18], period: [23, 31] },
  { color: COLORS[1], radius: 0.48, x: [0.08, 0.1], y: [0.95, 0.12], period: [29, 19] },
  { color: COLORS[2], radius: 0.36, x: [0.5, 0.25], y: [1.1, 0.1], period: [37, 27] },
]

function makeParticles(width, height) {
  const count = Math.round(Math.min(130, Math.max(45, (width * height) / 7000)))
  return Array.from({ length: count }, (_, index) => {
    const bokeh = index % 14 === 0
    return {
      x: Math.random() * width, y: Math.random() * height,
      r: bokeh ? 3 + Math.random() * 3 : 0.8 + Math.random() * 2,
      vx: (Math.random() - 0.5) * 0.12, vy: -(0.04 + Math.random() * 0.16),
      depth: 0.3 + Math.random() * 0.7, phase: Math.random() * Math.PI * 2, speed: 0.6 + Math.random() * 1.6,
      color: COLORS[index % COLORS.length], bokeh, ox: 0, oy: 0,
    }
  })
}

export function HeroParticles({ className }) {
  const canvasRef = useRef(null)
  useEffect(() => {
    const canvas = canvasRef.current, context = canvas?.getContext('2d')
    if (!canvas || !context) return undefined
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    let width = 0, height = 0, particles = [], frame = 0, visible = true, dark = document.documentElement.classList.contains('dark')
    const pointer = { x: -1e4, y: -1e4, px: 0, py: 0 }
    function resize() {
      const rect = canvas.getBoundingClientRect(), ratio = Math.min(2, window.devicePixelRatio || 1)
      width = rect.width; height = rect.height
      canvas.width = Math.round(width * ratio); canvas.height = Math.round(height * ratio)
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      particles = makeParticles(width, height)
    }
    function draw(time) {
      const t = time / 1000
      context.globalCompositeOperation = 'source-over'
      context.clearRect(0, 0, width, height)
      context.globalCompositeOperation = dark ? 'lighter' : 'source-over'
      for (const blob of BLOBS) {
        const cx = (blob.x[0] + Math.sin((t / blob.period[0]) * Math.PI * 2) * blob.x[1]) * width
        const cy = (blob.y[0] + Math.cos((t / blob.period[1]) * Math.PI * 2) * blob.y[1]) * height
        const radius = blob.radius * Math.max(width, height * 1.6)
        const gradient = context.createRadialGradient(cx, cy, 0, cx, cy, radius)
        const [r, g, b] = blob.color, alpha = dark ? 0.22 : 0.16
        gradient.addColorStop(0, `rgba(${r},${g},${b},${alpha})`); gradient.addColorStop(1, `rgba(${r},${g},${b},0)`)
        context.fillStyle = gradient; context.fillRect(0, 0, width, height)
      }
      // Pointer parallax eases toward the cursor offset from the centre.
      pointer.px += ((pointer.x > -1e3 ? (pointer.x / width - 0.5) : 0) - pointer.px) * 0.04
      pointer.py += ((pointer.y > -1e3 ? (pointer.y / height - 0.5) : 0) - pointer.py) * 0.04
      for (const p of particles) {
        if (!reduced) {
          p.x += p.vx; p.y += p.vy
          const dx = p.x - pointer.x, dy = p.y - pointer.y, distance = Math.hypot(dx, dy)
          if (distance < 110 && distance > 0.1) { const push = (1 - distance / 110) * 2.2; p.ox += (dx / distance) * push; p.oy += (dy / distance) * push }
          p.ox *= 0.94; p.oy *= 0.94
          if (p.y < -10) { p.y = height + 10; p.x = Math.random() * width }
          if (p.x < -10) p.x = width + 10; else if (p.x > width + 10) p.x = -10
        }
        const x = p.x + p.ox - pointer.px * 24 * p.depth, y = p.y + p.oy - pointer.py * 16 * p.depth
        const twinkle = 0.55 + 0.45 * Math.sin(t * p.speed + p.phase)
        const [r, g, b] = p.color
        if (p.bokeh) {
          const gradient = context.createRadialGradient(x, y, 0, x, y, p.r * 3)
          gradient.addColorStop(0, `rgba(${r},${g},${b},${(dark ? 0.35 : 0.3) * twinkle})`); gradient.addColorStop(1, `rgba(${r},${g},${b},0)`)
          context.fillStyle = gradient; context.beginPath(); context.arc(x, y, p.r * 3, 0, Math.PI * 2); context.fill()
        } else {
          context.fillStyle = `rgba(${r},${g},${b},${(dark ? 0.85 : 0.75) * twinkle * p.depth})`
          context.beginPath(); context.arc(x, y, p.r, 0, Math.PI * 2); context.fill()
        }
      }
    }
    function loop(time) {
      draw(time)
      frame = visible && !document.hidden && !reduced ? requestAnimationFrame(loop) : 0
    }
    const start = () => { if (!frame && visible && !document.hidden && !reduced) frame = requestAnimationFrame(loop) }
    resize(); draw(performance.now()); start()
    const resizeObserver = new ResizeObserver(() => { resize(); if (reduced || !frame) draw(performance.now()) })
    resizeObserver.observe(canvas)
    const intersection = new IntersectionObserver(([entry]) => { visible = entry.isIntersecting; start() })
    intersection.observe(canvas)
    const themeObserver = new MutationObserver(() => { dark = document.documentElement.classList.contains('dark'); if (reduced) draw(performance.now()) })
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] })
    const host = canvas.parentElement
    const move = event => { const rect = canvas.getBoundingClientRect(); pointer.x = event.clientX - rect.left; pointer.y = event.clientY - rect.top }
    const leave = () => { pointer.x = -1e4; pointer.y = -1e4 }
    host?.addEventListener('pointermove', move); host?.addEventListener('pointerleave', leave)
    document.addEventListener('visibilitychange', start)
    return () => {
      cancelAnimationFrame(frame); resizeObserver.disconnect(); intersection.disconnect(); themeObserver.disconnect()
      host?.removeEventListener('pointermove', move); host?.removeEventListener('pointerleave', leave)
      document.removeEventListener('visibilitychange', start)
    }
  }, [])
  return <canvas ref={canvasRef} aria-hidden className={className} />
}
