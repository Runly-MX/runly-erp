// Overlays drawn by the UI from engine data. Guides and grid live inside the
// scaled page (document coordinates, 1 screen px wide at any zoom); rulers sit
// on the viewport edges (screen coordinates from getEditorPreferences).

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

// Tick labels at most every ~56 screen px; the corner square covers the overlap.
export function Rulers({ references }) {
  if (!references) return null
  const spacing = references.grid.displayStep * references.zoom
  const every = Math.max(1, Math.ceil(56 / spacing))
  const ticks = (axis, list) => list.map((tick, index) => {
    const major = index % every === 0, size = major ? 10 : 5
    return axis === 'x'
      ? <g key={tick.value}><line x1={tick.screen} x2={tick.screen} y1={20 - size} y2={20} />{major ? <text x={tick.screen + 3} y={9}>{tick.value}</text> : null}</g>
      : <g key={tick.value}><line y1={tick.screen} y2={tick.screen} x1={20 - size} x2={20} />{major ? <text x={9} y={tick.screen + 3} transform={`rotate(-90 9 ${tick.screen + 3})`}>{tick.value}</text> : null}</g>
  })
  const strip = 'pointer-events-none absolute z-[16] bg-[hsl(var(--card)/0.92)] text-[hsl(var(--muted-foreground))] [&_line]:stroke-current [&_text]:fill-current [&_text]:text-[9px] [&_text]:tabular-nums'
  return (
    <>
      <svg aria-hidden className={`${strip} left-0 right-0 top-0 h-5 w-full border-b border-[hsl(var(--border))]`}>{ticks('x', references.x)}</svg>
      <svg aria-hidden className={`${strip} bottom-0 left-0 top-0 h-full w-5 border-r border-[hsl(var(--border))]`}>{ticks('y', references.y)}</svg>
      <span aria-hidden className="pointer-events-none absolute left-0 top-0 z-[17] h-5 w-5 border-b border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]" />
    </>
  )
}
