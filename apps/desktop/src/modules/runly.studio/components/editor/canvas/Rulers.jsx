import { useLayoutEffect, useMemo, useRef } from 'react'

const SIZE = 20, ACCENT = '#d946ef'

// "Nice" ruler steps (1, 2, 5 × 10ⁿ): labels at least ~64 px apart on screen,
// with 4–5 minor ticks between them, whatever the zoom.
export function rulerSteps(zoom) {
  const target = 64 / zoom, power = 10 ** Math.floor(Math.log10(target))
  const factor = [1, 2, 5, 10].find(value => value * power >= target)
  const major = factor * power
  return { major, minor: major / (factor === 2 ? 4 : 5) }
}

// Ticks over the page plus one page of margin on each side, in document units.
function ticks(length, steps) {
  const list = [], from = Math.floor(-length / steps.minor) * steps.minor, to = 2 * length
  for (let value = from; value <= to; value += steps.minor) {
    const rounded = Math.round(value * 1000) / 1000
    list.push({ value: rounded, major: Math.abs(rounded / steps.major - Math.round(rounded / steps.major)) < 1e-6 })
  }
  return list
}

function Strip({ axis, page, zoom, steps, selection, groupRef }) {
  const length = axis === 'x' ? page.width : page.height
  const marks = useMemo(() => ticks(length, steps), [length, steps])
  const at = value => Math.round(value * zoom) + 0.5 // crisp 1 px lines
  const band = selection ? { from: (axis === 'x' ? selection.x : selection.y) * zoom, size: (axis === 'x' ? selection.width : selection.height) * zoom } : null
  return (
    <svg aria-hidden className={axis === 'x' ? 'absolute left-0 right-0 top-0 h-5 w-full' : 'absolute bottom-0 left-0 top-0 h-full w-5'} shapeRendering="crispEdges">
      <g ref={groupRef}>
        {/* Page extent in a slightly stronger tone, the rest of the ruler stays neutral. */}
        <rect {...(axis === 'x' ? { x: 0, y: 0, width: length * zoom, height: SIZE } : { x: 0, y: 0, width: SIZE, height: length * zoom })} className="fill-[hsl(var(--muted)/0.6)]" />
        {band ? <rect {...(axis === 'x' ? { x: band.from, y: 0, width: band.size, height: SIZE } : { x: 0, y: band.from, width: SIZE, height: band.size })} fill={ACCENT} fillOpacity="0.16" /> : null}
        {marks.map(({ value, major }) => {
          const p = at(value), size = major ? 8 : 4
          return axis === 'x'
            ? <g key={value}><line x1={p} x2={p} y1={SIZE - size} y2={SIZE} />{major ? <text x={p + 3} y={9}>{value}</text> : null}</g>
            : <g key={value}><line y1={p} y2={p} x1={SIZE - size} x2={SIZE} />{major ? <text x={9} y={p - 3} transform={`rotate(-90 9 ${p - 3})`} textAnchor="start">{value}</text> : null}</g>
        })}
        {band ? (axis === 'x'
          ? <><line x1={at(selection.x)} x2={at(selection.x)} y1={0} y2={SIZE} stroke={ACCENT} /><line x1={at(selection.x + selection.width)} x2={at(selection.x + selection.width)} y1={0} y2={SIZE} stroke={ACCENT} /></>
          : <><line y1={at(selection.y)} y2={at(selection.y)} x1={0} x2={SIZE} stroke={ACCENT} /><line y1={at(selection.y + selection.height)} y2={at(selection.y + selection.height)} x1={0} x2={SIZE} stroke={ACCENT} /></>) : null}
      </g>
    </svg>
  )
}

// Rulers on the viewport edges. Ticks depend only on the zoom; scrolling just
// moves them (one transform per frame, read from the page's real position), so
// they never lag behind or jump while panning.
export function Rulers({ viewportRef, paperRef, page, zoom, selection }) {
  const steps = useMemo(() => rulerSteps(zoom), [zoom])
  const xRef = useRef(null), yRef = useRef(null), boxRef = useRef(null)
  useLayoutEffect(() => {
    const viewport = viewportRef.current
    if (!viewport) return undefined
    let frame = 0
    const place = () => {
      frame = 0
      const paper = paperRef.current?.getBoundingClientRect(), area = boxRef.current?.getBoundingClientRect()
      if (!paper || !area) return
      xRef.current?.setAttribute('transform', `translate(${Math.round(paper.left - area.left)} 0)`)
      yRef.current?.setAttribute('transform', `translate(0 ${Math.round(paper.top - area.top)})`)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(place) }
    place()
    viewport.addEventListener('scroll', place, { passive: true }); viewport.addEventListener('studio:viewport', place)
    const observer = new ResizeObserver(schedule); observer.observe(viewport)
    return () => { cancelAnimationFrame(frame); viewport.removeEventListener('scroll', place); viewport.removeEventListener('studio:viewport', place); observer.disconnect() }
  }, [viewportRef, paperRef, zoom, page.width, page.height])
  const text = '[&_line]:stroke-[hsl(var(--muted-foreground)/0.7)] [&_text]:fill-[hsl(var(--muted-foreground))] [&_text]:text-[9px] [&_text]:font-medium [&_text]:tabular-nums'
  return (
    <div ref={boxRef} aria-hidden className={`pointer-events-none absolute inset-0 z-[16] ${text}`}>
      <div className="absolute left-0 right-0 top-0 h-5 overflow-hidden border-b border-[hsl(var(--border))] bg-[hsl(var(--card)/0.94)] backdrop-blur-sm">
        <Strip axis="x" page={page} zoom={zoom} steps={steps} selection={selection} groupRef={xRef} />
      </div>
      <div className="absolute bottom-0 left-0 top-0 w-5 overflow-hidden border-r border-[hsl(var(--border))] bg-[hsl(var(--card)/0.94)] backdrop-blur-sm">
        <Strip axis="y" page={page} zoom={zoom} steps={steps} selection={selection} groupRef={yRef} />
      </div>
      <span className="absolute left-0 top-0 z-[1] h-5 w-5 border-b border-r border-[hsl(var(--border))] bg-[hsl(var(--card))]" />
    </div>
  )
}
