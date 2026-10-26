import {photoFileId} from '../../../../../shared/studio/shape-properties.js'
import {scheduled} from '../lib/resource-queue.js'
import { memo, useEffect, useState } from 'react'
import { cn } from '@runly/ui'
import { ensureStudioFont } from '../lib/studio-fonts.js'
import {studioFontStyle} from '../../../../../shared/studio/fonts.js'

function RenderedItem({item,images}) {
  const [preview,setPreview]=useState(null),url=images?.[photoFileId(item)],key=JSON.stringify(item)
  useEffect(()=>{
    const controller=new AbortController()
    if(photoFileId(item)&&!url)return ()=>controller.abort()
    scheduled(async()=>{const {renderThumbnailItem}=await import('../lib/thumbnail-renderer.js');return renderThumbnailItem(JSON.parse(key),url)},controller.signal)
      .then(value=>{if(!controller.signal.aborted)setPreview({key,urlSource:url,...value})}).catch(()=>{})
    return ()=>controller.abort()
  },[key,url])
  if(!preview||preview.key!==key||preview.urlSource!==url)return <rect width={item.width} height={item.height} fill="#94a3b8" opacity="0.22" />
  const p=preview.padding
  return <image href={preview.url} x={-p} y={-p} width={item.width+p*2} height={item.height+p*2} preserveAspectRatio="none" />
}

// Vector preview of a Studio document (or the bounded list `preview`): shapes
// and text render as SVG; images use the signed URLs passed in `images`, or a
// neutral placeholder while they load or when access is missing.
function Item({ item, images }) {
  const transform = `translate(${item.x} ${item.y}) rotate(${item.rotation ?? 0})`
  if(item.type==='line'||item.fillPaint||item.shape||(item.type==='image'&&item.image))return <g transform={`${transform} scale(${item.scaleX??1} ${item.scaleY??1})`}><RenderedItem item={item} images={images} /></g>
  if(item.type==='line')return <polyline transform={`${transform} scale(${item.scaleX??1} ${item.scaleY??1})`} points={item.points.map(([x,y])=>`${x*item.width},${y*item.height}`).join(' ')} fill="none" stroke={item.fill} strokeWidth={item.strokeWidth} />
  if (item.type === 'rectangle') return <rect transform={transform} width={item.width} height={item.height} fill={item.fill} />
  if (item.type === 'ellipse') return <ellipse transform={transform} cx={item.width / 2} cy={item.height / 2} rx={item.width / 2} ry={item.height / 2} fill={item.fill} />
  if (item.type === 'vector') return <g transform={`${transform} scale(${item.width / item.geometry.width} ${item.height / item.geometry.height})`}>
    {item.geometry.paths.map((path,index) => <path key={index} d={path.d} fill={path.fill === 'color' ? item.fill : 'none'} stroke={path.stroke === 'color' ? item.fill : 'none'} strokeWidth={path.strokeWidth} strokeLinecap={path.cap} strokeLinejoin={path.join} />)}
  </g>
  // Fabric stretches images to width × height (scaleX/scaleY), hence "none".
  if (item.type === 'image' && images?.[item.fileAssetId]) return <image transform={transform} href={images[item.fileAssetId]} width={item.width} height={item.height} preserveAspectRatio="none" />
  if (item.type === 'image') {
    return <g transform={transform}>
      <rect width={item.width} height={item.height} className="fill-[hsl(var(--muted-foreground))]" opacity="0.22" />
      <path d={`M${item.width * 0.18} ${item.height * 0.78}L${item.width * 0.42} ${item.height * 0.46}L${item.width * 0.58} ${item.height * 0.64}L${item.width * 0.68} ${item.height * 0.54}L${item.width * 0.84} ${item.height * 0.78}Z`}
        className="fill-[hsl(var(--muted-foreground))]" opacity="0.4" />
    </g>
  }
  // Fabric Textbox: unscaled width, then scaleX/scaleY; lineHeight 1.16.
  return <g transform={`${transform} scale(${item.scaleX ?? 1} ${item.scaleY ?? 1})`}>
    {/* Visible overflow: stored heights are estimates; wrapped lines must not clip. */}
    <foreignObject width={item.width} height={Math.max(item.height, item.fontSize * 1.2)} overflow="visible">
      <div style={{ color: item.fill, fontSize: item.fontSize, lineHeight: item.lineHeight??1.16, textAlign:item.textAlign??'left',letterSpacing:((item.charSpacing??0)/1000)*item.fontSize,
        fontWeight:studioFontStyle(item.fontFamily??'sans-serif',item.fontVariant)?.weight??400,fontStyle:studioFontStyle(item.fontFamily??'sans-serif',item.fontVariant)?.style??'normal',textDecoration:[item.underline?'underline':'',item.linethrough?'line-through':''].join(' '),
        fontFamily: item.fontFamily ?? 'sans-serif', whiteSpace: 'pre-wrap', overflowWrap: 'break-word' }}>{item.text}</div>
    </foreignObject>
  </g>
}

// `images` (optional) maps fileAssetId → signed URL; missing ones stay placeholders.
// fit "contain" shows the whole page as paper; "cover" fills its box (cropped from
// the top), so a grid of mixed sizes lines up.
export const StudioThumbnail = memo(function StudioThumbnail({ document, images, frameRatio = 4 / 3, fit = 'contain', className }) {
  const page = document?.page
  // Bundled fonts load on demand; once added to document.fonts the browser
  // re-lays out the foreignObject text, so the preview matches the editor.
  const families = [...new Set((document?.objects ?? []).filter(item => item.type === 'text' && item.fontFamily).map(item => `${item.fontFamily}:${item.fontVariant??'regular'}`))].sort().join('|')
  useEffect(() => { for (const entry of families.split('|').filter(Boolean)) {const [family,variant]=entry.split(':');ensureStudioFont(family,variant).catch(() => {})} }, [families])
  if (!page) return null
  const wide = page.width / page.height >= frameRatio, cover = fit === 'cover'
  return <svg viewBox={`0 0 ${page.width} ${page.height}`} aria-hidden focusable="false" preserveAspectRatio={cover ? 'xMidYMin slice' : undefined}
    className={cn('block', cover ? 'h-full w-full' : cn('rounded-[3px] shadow-[0_8px_24px_-8px_rgb(0_0_0/0.35)] ring-1 ring-black/5', wide ? 'h-auto w-full' : 'h-full w-auto'), className)}
    style={cover ? undefined : { aspectRatio: `${page.width} / ${page.height}` }}>
    <rect width={page.width} height={page.height} fill={page.background} />
    {(document.objects ?? []).filter(item => !item.hidden).map(item => <g key={item.id} opacity={item.opacity??1}><Item item={item} images={images} /></g>)}
  </svg>
})
