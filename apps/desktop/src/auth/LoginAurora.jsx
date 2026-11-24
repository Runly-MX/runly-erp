import { useState } from 'react'

// Login backdrop: silky light ribbons drawn in SVG (no raster asset, sharp at
// any size). Each ribbon path lives once in <defs> and morphs between two
// three shapes (SMIL, same command structure) while its gradient drifts along
// it; the glow band and the hairline fan are <use> copies, so one animation
// drives them all. Dark-only by design: the login forces dark mode.

const RIBBONS = [
  {
    id: 'cool',
    d: [
      'M -120 640 C 260 520 520 780 840 610 S 1300 170 1720 110',
      'M -120 560 C 320 620 560 680 880 540 S 1260 260 1720 160',
      'M -120 680 C 220 480 600 820 800 660 S 1340 140 1720 80',
    ],
    stops: ['#22d3ee', '#3b82f6', '#8b5cf6', '#c026d3'],
    glow: 0.55,
    morph: '18s',
    flow: '22s',
  },
  {
    id: 'warm',
    d: [
      'M -120 790 C 240 650 560 900 920 720 S 1360 430 1720 480',
      'M -120 730 C 300 760 620 800 960 660 S 1320 520 1720 420',
      'M -120 830 C 200 620 520 940 880 760 S 1400 380 1720 520',
    ],
    stops: ['#f97316', '#fb7185', '#d946ef', '#6366f1'],
    glow: 0.6,
    morph: '21s',
    flow: '26s',
  },
  {
    id: 'top',
    d: [
      'M 380 -60 C 640 150 900 110 1120 300 S 1420 520 1720 400',
      'M 320 -60 C 600 90 940 190 1160 250 S 1460 440 1720 460',
      'M 420 -60 C 680 200 860 60 1100 340 S 1400 560 1720 360',
    ],
    stops: ['#1d4ed8', '#3b82f6', '#a855f7', '#ec4899'],
    glow: 0.4,
    morph: '25s',
    flow: '30s',
  },
]

const HAIRLINES = Array.from({ length: 12 }, (_, i) => i)
const EASE = '0.45 0 0.55 1'
const SPLINE3 = `${EASE};${EASE};${EASE}`
const SPLINE2 = `${EASE};${EASE}`

function prefersReducedMotion() {
  try { return window.matchMedia('(prefers-reduced-motion: reduce)').matches }
  catch { return false }
}

export function LoginAurora() {
  // SMIL ignores CSS, so reduced motion is honoured by not rendering <animate>.
  const [still] = useState(prefersReducedMotion)
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden bg-[#050a1c]">
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(60% 50% at 20% 85%, rgba(249,115,22,.18), transparent 70%), radial-gradient(50% 45% at 75% 15%, rgba(59,130,246,.18), transparent 70%), radial-gradient(40% 40% at 95% 95%, rgba(236,72,153,.16), transparent 70%)',
        }}
      />
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1600 900" preserveAspectRatio="xMidYMid slice">
        <defs>
          {RIBBONS.map((r) => (
            <g key={r.id}>
              {/* Colors drift along the ribbon; reflect keeps the edges filled. */}
              <linearGradient id={`aurora-grad-${r.id}`} x1="0" y1="0" x2="1" y2="0" spreadMethod="reflect">
                {r.stops.map((c, i) => (
                  <stop key={c} offset={i / (r.stops.length - 1)} stopColor={c} />
                ))}
                {!still && (
                  <animateTransform
                    attributeName="gradientTransform"
                    type="translate"
                    dur={r.flow}
                    repeatCount="indefinite"
                    values="-0.1 0;0.1 0;-0.1 0"
                    calcMode="spline"
                    keySplines={SPLINE2}
                  />
                )}
              </linearGradient>
              <path id={`aurora-${r.id}`} d={r.d[0]}>
                {!still && (
                  <animate
                    attributeName="d"
                    dur={r.morph}
                    repeatCount="indefinite"
                    values={`${r.d[0]};${r.d[1]};${r.d[2]};${r.d[0]}`}
                    keyTimes="0;0.33;0.67;1"
                    calcMode="spline"
                    keySplines={SPLINE3}
                  />
                )}
              </path>
            </g>
          ))}
          <filter id="aurora-blur" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="22" />
          </filter>
        </defs>
        {RIBBONS.map((r) => {
          const href = `#aurora-${r.id}`
          const stroke = `url(#aurora-grad-${r.id})`
          return (
            <g key={r.id} fill="none">
              <use href={href} stroke={stroke} strokeWidth="90" strokeOpacity={r.glow} filter="url(#aurora-blur)" />
              {HAIRLINES.map((i) => (
                <use
                  key={i}
                  href={href}
                  transform={`translate(0 ${i * 6 - 33})`}
                  stroke={stroke}
                  strokeWidth={i === 5 ? 2.2 : 1}
                  strokeOpacity={0.9 - Math.abs(i - 5) * 0.12}
                />
              ))}
            </g>
          )
        })}
      </svg>
      {/* Bottom vignette keeps the footer legible over the ribbons. */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#050a1c]/80 to-transparent" />
    </div>
  )
}
