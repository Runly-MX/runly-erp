// Overlays drawn by the UI from engine data. Guides and grid live inside the
// scaled page (document coordinates, 1 screen px wide at any zoom). Rulers are
// in Rulers.jsx.

const GUIDE = '#d946ef'

export function GuidesOverlay({ guides, page, zoom }) {
  if (!guides.length) return null
  const w = 1 / zoom, overshoot = 24 / zoom
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 z-[15] overflow-visible" width={page.width} height={page.height} viewBox={`0 0 ${page.width} ${page.height}`}>
      {guides.map((guide, index) => {
        const vertical = guide.axis === 'x', dashed = guide.kind === 'spacing' || guide.kind === 'grid'
        const line = vertical ? { x1: guide.position, x2: guide.position, y1: -overshoot, y2: page.height + overshoot } : { y1: guide.position, y2: guide.position, x1: -overshoot, x2: page.width + overshoot }
        return (
          <g key={`${guide.axis}:${guide.position}:${guide.kind}:${index}`}>
            {/* Light halo keeps the guide readable over dark and saturated artwork. */}
            <line {...line} stroke="#ffffff" strokeOpacity="0.7" strokeWidth={w * 3} />
            <line {...line} stroke={GUIDE} strokeWidth={w * (guide.kind === 'page' ? 1.5 : 1)} strokeDasharray={dashed ? `${4 * w} ${3 * w}` : undefined} />
            {guide.kind === 'spacing' && Number.isFinite(guide.gap) ? (
              <text x={vertical ? guide.position + 6 * w : 8 * w} y={vertical ? 16 * w : guide.position - 6 * w} fontSize={11 * w} fontWeight="600" fill={GUIDE} paintOrder="stroke" stroke="#ffffff" strokeWidth={3 * w}>
                {Math.round(guide.gap)} px
              </text>
            ) : null}
          </g>
        )
      })}
    </svg>
  )
}

export function GridOverlay({ page, zoom, step }) {
  const id = `studio-grid-${step}`
  return (
    <svg aria-hidden className="pointer-events-none absolute inset-0 z-[14]" width={page.width} height={page.height}>
      <defs>
        <pattern id={id} width={step} height={step} patternUnits="userSpaceOnUse">
          <path d={`M ${step} 0 L 0 0 0 ${step}`} fill="none" stroke="#64748b" strokeOpacity="0.35" strokeWidth={1 / zoom} />
        </pattern>
      </defs>
      <rect width={page.width} height={page.height} fill={`url(#${id})`} />
    </svg>
  )
}
