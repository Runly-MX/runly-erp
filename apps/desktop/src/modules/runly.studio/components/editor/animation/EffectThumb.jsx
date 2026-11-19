import { useEffect, useMemo, useState } from 'react'
import { sceneAt } from '../../../../../../../shared/studio/motion.js'

// Miniature drawn by the motion engine itself on a tiny page: at rest it shows a trail of
// four instants (what the effect does at a glance); while `playing` it runs the effect.
const PAGE = { id: 'thumb', width: 160, height: 100, background: '#ffffff' }
const BOX = { id: 'o', type: 'rectangle', x: 55, y: 33, width: 50, height: 34, rotation: 0, fill: '#d946ef' }
const DURATION = 900, LEAD = 150
const preset = (kind, choice) => (choice === 'appear' ? { preset: 'fade', duration: 0 } : { preset: choice, duration: DURATION })
const documentOf = (kind, choice) => ({ schemaVersion: 8, unit: 'px', additionalPages: [],
  page: { ...PAGE, slide: { duration: DURATION + 2 * LEAD } },
  objects: [{ ...BOX, [kind]: { ...preset(kind, choice), delay: LEAD, easing: kind === 'exit' ? 'ease-in' : kind === 'emphasis' ? 'ease-in-out' : 'ease-out', ...(kind === 'emphasis' ? { repeat: 1 } : {}) } }] })
const TRAIL = { enter: [0.2, 0.45, 0.7, 1], exit: [0, 0.3, 0.55, 0.8], emphasis: [0.15, 0.38, 0.62, 0.85] }

function Box({ item, opacity = 1 }) {
  if (item.hidden) return null
  const c = item.clip ?? { left: 0, top: 0, right: 0, bottom: 0 }, w = item.width, h = item.height
  return (
    <g transform={`translate(${item.x} ${item.y}) rotate(${item.rotation})`} opacity={(item.opacity ?? 1) * opacity}>
      <rect x={c.left * w} y={c.top * h} width={Math.max(0, w * (1 - c.left - c.right))} height={Math.max(0, h * (1 - c.top - c.bottom))} rx="4" fill="currentColor" />
    </g>
  )
}

export function EffectThumb({ kind, choice, playing }) {
  const document = useMemo(() => documentOf(kind, choice), [kind, choice])
  const [time, setTime] = useState(null)
  useEffect(() => {
    if (!playing) { setTime(null); return undefined }
    let frame
    const origin = performance.now()
    const loop = () => {
      const at = performance.now() - origin
      setTime(Math.min(at, DURATION + 2 * LEAD))
      if (at < DURATION + 2 * LEAD) frame = requestAnimationFrame(loop)
    }
    frame = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(frame)
  }, [playing, document])
  const items = time === null
    ? TRAIL[kind].map((fraction, index) => ({ item: sceneAt(document, 'thumb', LEAD + DURATION * fraction).objects[0], opacity: 0.25 + 0.25 * index }))
    : [{ item: sceneAt(document, 'thumb', time).objects[0], opacity: 1 }]
  return (
    <svg viewBox={`0 0 ${PAGE.width} ${PAGE.height}`} aria-hidden className="block h-full w-full text-fuchsia-500">
      <rect x="2" y="2" width={PAGE.width - 4} height={PAGE.height - 4} rx="6" className="fill-[hsl(var(--muted))]" />
      {items.map(({ item, opacity }, index) => <Box key={index} item={item} opacity={opacity} />)}
    </svg>
  )
}
