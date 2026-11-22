import { useEffect, useMemo, useState } from 'react'
import { sceneAt } from '../../../../../../../shared/studio/motion.js'
import { describeEffect } from '../../../lib/effect-glyph.js'

// Miniature of one preset (the object is opaque so ghosts never show through it), drawn from the motion engine itself. At rest it explains the effect
// in neutral ink with one accent (direction arrow, rotation arc, scale corners, revealing edge
// or an intensity curve for oscillations); while `playing` it runs the real effect once.
const W = 160, H = 100
const DURATION = 900, LEAD = 150, TOTAL = DURATION + 2 * LEAD

function Shape({ item, ghost, faint = 0.45 }) {
  if (!item || item.hidden) return null
  const c = item.clip ?? { left: 0, top: 0, right: 0, bottom: 0 }, w = item.width, h = item.height
  const rect = { x: c.left * w, y: c.top * h, width: Math.max(0, w * (1 - c.left - c.right)), height: Math.max(0, h * (1 - c.top - c.bottom)), rx: 4 }
  return (
    <g transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`}>
      {ghost ? <rect {...rect} fill="currentColor" fillOpacity="0.05" stroke="currentColor" strokeOpacity={faint} strokeWidth="1.2" strokeDasharray="3 2.5" />
        : <rect {...rect} className="fill-[hsl(var(--muted-foreground))]" fillOpacity={item.opacity ?? 1} />}
    </g>
  )
}

const head = (x, y, angle, size = 5) => `M${x} ${y}L${x - size * Math.cos(angle - 0.55)} ${y - size * Math.sin(angle - 0.55)}M${x} ${y}L${x - size * Math.cos(angle + 0.55)} ${y - size * Math.sin(angle + 0.55)}`
function Arrow({ from, to }) {
  const angle = Math.atan2(to[1] - from[1], to[0] - from[0])
  return <path d={`M${from[0]} ${from[1]}L${to[0]} ${to[1]}${head(to[0], to[1], angle)}`} />
}
// Arc around (cx, cy) from a0 to a1 (degrees, clockwise positive) with a head at a1.
function Arc({ cx, cy, r, a0, a1 }) {
  const rad = a => (a * Math.PI) / 180, p = a => [cx + r * Math.cos(rad(a)), cy + r * Math.sin(rad(a))]
  const [x0, y0] = p(a0), [x1, y1] = p(a1), sweep = a1 > a0 ? 1 : 0, large = Math.abs(a1 - a0) > 180 ? 1 : 0
  const tangent = rad(a1) + (sweep ? Math.PI / 2 : -Math.PI / 2)
  return <path d={`M${x0} ${y0}A${r} ${r} 0 ${large} ${sweep} ${x1} ${y1}${head(x1, y1, tangent)}`} />
}

function Accents({ glyph }) {
  const { rest, accents } = glyph, [cx, cy] = rest.center
  return accents.map((accent, index) => {
    if (accent.type === 'move') return <Arrow key={index} from={accent.from} to={accent.to} />
    if (accent.type === 'turn') return <Arc key={index} cx={cx} cy={cy} r={accent.radius} a0={accent.a0} a1={accent.a1} />
    if (accent.type === 'scale') {
      const dx = rest.width / 2 + 4, dy = rest.height / 2 + 4, k = accent.outward ? 1 : -1
      return <g key={index}>{[[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
        const at = [cx + sx * dx, cy + sy * dy], tip = [at[0] + sx * 6 * k, at[1] + sy * 6 * k]
        return <Arrow key={`${sx}${sy}`} from={accent.outward ? at : tip} to={accent.outward ? tip : at} />
      })}</g>
    }
    if (accent.type === 'edge') return accent.arrows.map((arrow, i) => <Arrow key={`${index}-${i}`} from={arrow.from} to={arrow.to} />)
    if (accent.type === 'time') return <Arrow key={index} from={[36, 76]} to={[124, 76]} />
    return null
  })
}

// Intensity curve of an oscillating effect (bounce, elastic, shake...): what sets it apart.
function Curve({ points, at }) {
  const x = i => 24 + (112 * i) / (points.length - 1), y = v => 88 - 10 * v
  const d = points.map((value, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(value).toFixed(1)}`).join('')
  const dot = at === null ? null : Math.min(points.length - 1, Math.round(at * (points.length - 1)))
  return (
    <g>
      <line x1="24" x2="136" y1="88" y2="88" className="stroke-current" strokeOpacity="0.2" strokeDasharray="2 2" />
      <path d={d} fill="none" className="stroke-fuchsia-500 dark:stroke-fuchsia-400" strokeWidth="1.5" strokeLinejoin="round" />
      {dot !== null ? <circle cx={x(dot)} cy={y(points[dot])} r="2.4" className="fill-fuchsia-500 dark:fill-fuchsia-400" /> : null}
    </g>
  )
}

export function EffectThumb({ kind, choice, playing }) {
  const glyph = useMemo(() => describeEffect(kind, choice), [kind, choice])
  const [time, setTime] = useState(null)
  useEffect(() => {
    if (!playing) { setTime(null); return undefined }
    let frame
    const origin = performance.now()
    const loop = () => {
      const at = performance.now() - origin
      setTime(Math.min(at, TOTAL))
      if (at < TOTAL) frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [playing, glyph])
  const live = time === null ? null : sceneAt(glyph.document, 'thumb', time).objects[0]
  const progress = time === null ? null : Math.min(1, Math.max(0, (time - LEAD) / DURATION))
  return (
    <svg viewBox={`0 0 ${W} ${H}`} aria-hidden className="block h-full w-full text-[hsl(var(--foreground))]">
      <rect x="0" y="0" width={W} height={H} className="fill-[hsl(var(--muted))]" fillOpacity="0.55" />
      {live ? (
        <>
          {glyph.layout ? null : <Shape item={glyph.restItem} ghost faint={0.3} />}
          <Shape item={live} />
        </>
      ) : glyph.layout ? glyph.layout.map((item, index) => <Shape key={index} item={item} ghost={item.ghost} />) : (
        <>
          {glyph.ghosts.map((item, index) => <Shape key={index} item={item} ghost faint={item.faint} />)}
          <Shape item={glyph.solid} />
          {glyph.outline ? <Shape item={glyph.outline} ghost faint={0.4} /> : null}
        </>
      )}
      {!live || glyph.curve ? (
        <g fill="none" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="stroke-fuchsia-500 dark:stroke-fuchsia-400">
          {live ? null : <Accents glyph={glyph} />}
        </g>
      ) : null}
      {glyph.curve ? <Curve points={glyph.curve} at={progress} /> : null}
    </svg>
  )
}
