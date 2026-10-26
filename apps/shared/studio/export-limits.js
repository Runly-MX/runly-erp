export const STUDIO_EXPORT_LIMITS=Object.freeze({pixels:80_000_000,side:16384,scale:8,printPpi:300,printPixels:32_000_000})
export function exportDimensions(page,scale=1,bleed=0){
  if(!Number.isFinite(scale)||scale<0.25||scale>STUDIO_EXPORT_LIMITS.scale||!Number.isFinite(bleed)||bleed<0||bleed>400)throw Error('Tamaño de exportación no válido.')
  const width=Math.ceil((page.width+2*bleed)*scale),height=Math.ceil((page.height+2*bleed)*scale)
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<1||height<1||width>STUDIO_EXPORT_LIMITS.side||height>STUDIO_EXPORT_LIMITS.side||width*height>STUDIO_EXPORT_LIMITS.pixels)throw Error('La exportación supera 80 megapíxeles o 16384 px por lado. Elige un tamaño menor; no se redujo la resolución.')
  return {width,height,scale}
}
