// Login backdrop: silky light ribbons drawn in SVG (no raster asset, sharp at
// any size). Each ribbon is a blurred glow band plus a fan of hairlines that
// gives the "silk" sheen. Dark-only by design: the login forces dark mode.

const RIBBONS = [
  {
    id: 'cool',
    d: 'M -120 640 C 260 520 520 780 840 610 S 1300 170 1720 110',
    stops: ['#22d3ee', '#3b82f6', '#8b5cf6', '#c026d3'],
    glow: 0.55,
    drift: 'auroraFlowA 22s',
  },
  {
    id: 'warm',
    d: 'M -120 790 C 240 650 560 900 920 720 S 1360 430 1720 480',
    stops: ['#f97316', '#fb7185', '#d946ef', '#6366f1'],
    glow: 0.6,
    drift: 'auroraFlowB 26s',
  },
  {
    id: 'top',
    d: 'M 380 -60 C 640 150 900 110 1120 300 S 1420 520 1720 400',
    stops: ['#1d4ed8', '#3b82f6', '#a855f7', '#ec4899'],
    glow: 0.4,
    drift: 'auroraFlowB 30s',
  },
]

const HAIRLINES = Array.from({ length: 12 }, (_, i) => i)

export function LoginAurora() {
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
            <linearGradient key={r.id} id={`aurora-${r.id}`} x1="0" y1="0" x2="1" y2="0">
              {r.stops.map((c, i) => (
                <stop key={c} offset={i / (r.stops.length - 1)} stopColor={c} />
              ))}
            </linearGradient>
          ))}
          <filter id="aurora-blur" x="-20%" y="-50%" width="140%" height="200%">
            <feGaussianBlur stdDeviation="22" />
          </filter>
        </defs>
        {RIBBONS.map((r) => (
          <g key={r.id} className="aurora-flow" style={{ animation: `${r.drift} ease-in-out infinite` }}>
            <path d={r.d} fill="none" stroke={`url(#aurora-${r.id})`} strokeWidth="90" strokeOpacity={r.glow} filter="url(#aurora-blur)" />
            {HAIRLINES.map((i) => (
              <path
                key={i}
                d={r.d}
                transform={`translate(0 ${i * 6 - 33})`}
                fill="none"
                stroke={`url(#aurora-${r.id})`}
                strokeWidth={i === 5 ? 2.2 : 1}
                strokeOpacity={0.9 - Math.abs(i - 5) * 0.12}
              />
            ))}
          </g>
        ))}
      </svg>
      {/* Bottom vignette keeps the footer legible over the ribbons. */}
      <div className="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-[#050a1c]/80 to-transparent" />
    </div>
  )
}
