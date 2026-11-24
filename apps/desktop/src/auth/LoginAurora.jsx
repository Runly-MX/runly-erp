import { useState } from 'react'

// Login backdrop: silky light ribbons drawn in SVG (no raster asset, sharp at
// any size). Each ribbon path lives once in <defs> and morphs between two
// shapes (SMIL, same command structure); the glow band, the hairline fan and
// the travelling light pulse are <use> copies, so one animation drives them
// all. Dark-only by design: the login forces dark mode.

const RIBBONS = [
  {
    id: 'cool',
    d: [
      'M -120 640 C 260 520 520 780 840 610 S 1300 170 1720 110',
      'M -120 590 C 300 600 560 700 860 560 S 1280 240 1720 150',
    ],
    stops: ['#22d3ee', '#3b82f6', '#8b5cf6', '#c026d3'],
    glow: 0.55,
    morph: '13s',
    pulse: '7s',
  },
  {
    id: 'warm',
    d: [
      'M -120 790 C 240 650 560 900 920 720 S 1360 430 1720 480',
      'M -120 740 C 280 720 600 820 940 680 S 1340 500 1720 440',
    ],
    stops: ['#f97316', '#fb7185', '#d946ef', '#6366f1'],
    glow: 0.6,
    morph: '16s',
    pulse: '9s',
  },
  {
    id: 'top',
    d: [
      'M 380 -60 C 640 150 900 110 1120 300 S 1420 520 1720 400',
      'M 340 -60 C 620 110 920 170 1140 260 S 1440 460 1720 440',
    ],
    stops: ['#1d4ed8', '#3b82f6', '#a855f7', '#ec4899'],
    glow: 0.4,
    morph: '19s',
    pulse: '11s',
  },
]

const HAIRLINES = Array.from({ length: 12 }, (_, i) => i)
const SPLINE = '0.45 0 0.55 1;0.45 0 0.55 1'

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
              <linearGradient id={`aurora-grad-${r.id}`} x1="0" y1="0" x2="1" y2="0">
                {r.stops.map((c, i) => (
                  <stop key={c} offset={i / (r.stops.length - 1)} stopColor={c} />
                ))}
              </linearGradient>
              <path id={`aurora-${r.id}`} d={r.d[0]} pathLength="1000">
                {!still && (
                  <animate
                    attributeName="d"
                    dur={r.morph}
                    repeatCount="indefinite"
                    values={`${r.d[0]};${r.d[1]};${r.d[0]}`}
                    calcMode="spline"
                    keySplines={SPLINE}
                  />
                )}
              </path>
            </g>
          ))}
          <filter id="aurora-blur" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="22" />
          </filter>
          <filter id="aurora-spark" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="3" />
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
              {!still && (
                <use
                  href={href}
                  className="aurora-pulse"
                  stroke="#fff"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeDasharray="70 930"
                  filter="url(#aurora-spark)"
                  style={{ animation: `auroraPulse ${r.pulse} linear infinite` }}
                />
              )}
            </g>
          )
        })}
      </svg>
      {/* Bottom vignette keeps the footer legible over the ribbons. */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#050a1c]/80 to-transparent" />
    </div>
  )
}
