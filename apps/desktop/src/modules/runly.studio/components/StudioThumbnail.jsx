import { memo } from 'react'
import { cn } from '@runly/ui'

// Vector preview of a Studio document (or the bounded list `preview`): shapes
// and text render as SVG, images as a neutral placeholder so a grid of cards
// never needs one signed URL per design.
function Item({ item }) {
  const transform = `translate(${item.x} ${item.y}) rotate(${item.rotation ?? 0})`
  if (item.type === 'rectangle') return <rect transform={transform} width={item.width} height={item.height} fill={item.fill} />
  if (item.type === 'ellipse') return <ellipse transform={transform} cx={item.width / 2} cy={item.height / 2} rx={item.width / 2} ry={item.height / 2} fill={item.fill} />
  if (item.type === 'image') {
    return <g transform={transform}>
      <rect width={item.width} height={item.height} className="fill-[hsl(var(--muted-foreground))]" opacity="0.22" />
      <path d={`M${item.width * 0.18} ${item.height * 0.78}L${item.width * 0.42} ${item.height * 0.46}L${item.width * 0.58} ${item.height * 0.64}L${item.width * 0.68} ${item.height * 0.54}L${item.width * 0.84} ${item.height * 0.78}Z`}
        className="fill-[hsl(var(--muted-foreground))]" opacity="0.4" />
    </g>
  }
  // Fabric Textbox: unscaled width, then scaleX/scaleY; lineHeight 1.16.
  return <g transform={`${transform} scale(${item.scaleX ?? 1} ${item.scaleY ?? 1})`}>
    <foreignObject width={item.width} height={Math.max(item.height, item.fontSize * 1.2)}>
      <div style={{ color: item.fill, fontSize: item.fontSize, lineHeight: 1.16, fontFamily: 'sans-serif', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>{item.text}</div>
    </foreignObject>
  </g>
}

export const StudioThumbnail = memo(function StudioThumbnail({ document, frameRatio = 4 / 3, className }) {
  const page = document?.page
  if (!page) return null
  const wide = page.width / page.height >= frameRatio
  return <svg viewBox={`0 0 ${page.width} ${page.height}`} aria-hidden focusable="false"
    className={cn('block rounded-[3px] shadow-[0_8px_24px_-8px_rgb(0_0_0/0.35)] ring-1 ring-black/5', wide ? 'h-auto w-full' : 'h-full w-auto', className)}
    style={{ aspectRatio: `${page.width} / ${page.height}` }}>
    <rect width={page.width} height={page.height} fill={page.background} />
    {(document.objects ?? []).filter(item => !item.hidden).map(item => <Item key={item.id} item={item} />)}
  </svg>
})
