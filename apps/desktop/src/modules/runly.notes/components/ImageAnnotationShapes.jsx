// Read-only SVG rendering of the pen/arrow/rect/text annotations stored on
// images of older notes (the `annotations` node attribute, in a 1000x1000
// viewBox). New edits go through the full ImageEditorDialog and are baked
// into the image, so nothing writes this attribute anymore.
const W = 1000
const H = 1000

export function renderAnnotation(ann) {
  if (ann.type === 'path') {
    const pts = (ann.points || []).map((p) => `${p.x * W},${p.y * H}`).join(' ')
    return (
      <g key={ann.id}>
        <polyline
          points={pts}
          fill="none"
          stroke={ann.color}
          strokeWidth={ann.lineWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
        />
      </g>
    )
  }
  if (ann.type === 'arrow') {
    const x1 = ann.start.x * W
    const y1 = ann.start.y * H
    const x2 = ann.end.x * W
    const y2 = ann.end.y * H
    return (
      <g key={ann.id}>
        <defs>
          <marker id={`ah-${ann.id}`} markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
            <path d="M0,0 L0,6 L8,3 z" fill={ann.color} />
          </marker>
        </defs>
        <line
          x1={x1}
          y1={y1}
          x2={x2}
          y2={y2}
          stroke={ann.color}
          strokeWidth={ann.lineWidth}
          markerEnd={`url(#ah-${ann.id})`}
          vectorEffect="non-scaling-stroke"
        />
      </g>
    )
  }
  if (ann.type === 'rect') {
    const x = Math.min(ann.start.x, ann.end.x) * W
    const y = Math.min(ann.start.y, ann.end.y) * H
    const w = Math.abs(ann.end.x - ann.start.x) * W
    const h = Math.abs(ann.end.y - ann.start.y) * H
    return (
      <rect
        key={ann.id}
        x={x}
        y={y}
        width={w}
        height={h}
        stroke={ann.color}
        strokeWidth={ann.lineWidth}
        fill="none"
        vectorEffect="non-scaling-stroke"
      />
    )
  }
  if (ann.type === 'text') {
    return (
      <text
        key={ann.id}
        x={ann.svgX * W}
        y={ann.svgY * H}
        fill={ann.color}
        fontSize={ann.lineWidth * 8 + 12}
        fontWeight="bold"
        fontFamily="sans-serif"
        className="select-none"
      >
        {ann.text}
      </text>
    )
  }
  return null
}
