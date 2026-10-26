import { validateDocument } from '../../../../shared/studio/document.js'
import { studioObjects } from './studio-document-data.js'

// Fabric uses left/top origins. AABB is exact for the declared rotated rectangle;
// text glyph metrics, masks and arbitrary vector outlines require the renderer.
export function studioBounds(o) {
  const width = o.width * (o.scaleX ?? 1)
  const textHeight=o.type==='text'?o.text.split('\n').length*o.fontSize*(o.lineHeight??1.16):0
  const height = Math.max(o.height,textHeight) * (o.scaleY ?? 1)
  const angle = o.rotation * Math.PI / 180, c = Math.cos(angle), s = Math.sin(angle)
  const pad=o.type==='line'?Math.max(1,o.strokeWidth*2):((o.shape?.strokeWidth??o.image?.border?.width??0)/2)
  const px=pad*(o.scaleX??1),py=pad*(o.scaleY??1)
  const corners = [[-px,-py],[width+px,-py],[width+px,height+py],[-px,height+py]].map(([x,y]) => [o.x+x*c-y*s,o.y+x*s+y*c])
  return { left:Math.min(...corners.map(p=>p[0])),right:Math.max(...corners.map(p=>p[0])),top:Math.min(...corners.map(p=>p[1])),bottom:Math.max(...corners.map(p=>p[1])) }
}
const overlaps = (a,b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
const contains = (a,b) => a.left <= b.left && a.top <= b.top && a.right >= b.right && a.bottom >= b.bottom
function luminance(hex) {
  const rgb = hex.slice(1).match(/../g).map(n=>parseInt(n,16)/255).map(n=>n<=0.04045?n/12.92:((n+0.055)/1.055)**2.4)
  return rgb[0]*0.2126+rgb[1]*0.7152+rgb[2]*0.0722
}
export function studioContrast(a,b) {
  const x=luminance(a),y=luminance(b)
  return (Math.max(x,y)+0.05)/(Math.min(x,y)+0.05)
}

export function reviewStudioDocument(input) {
  const document = validateDocument(input), objects = studioObjects(document), findings = []
  const page = {left:0,top:0,right:document.page.width,bottom:document.page.height}
  const add = (o,severity,rule,message,suggestion) => findings.push({objectId:o?.id ?? null,severity,rule,message,suggestion})
  const families = new Set(objects.filter(o=>o.type==='text'&&!o.hidden).map(o=>o.fontFamily))
  if (families.size>3) add(null,'info','font_families','Hay más de tres familias tipográficas visibles.','Considera reducir familias para reforzar la jerarquía.')
  for (const [index,o] of objects.entries()) {
    const b = studioBounds(o)
    if (o.hidden || o.locked) add(o,'info','hidden_or_locked','Objeto oculto o bloqueado.','Comprueba que este estado sea intencional.')
    if (o.hidden) continue
    if (!overlaps(page,b)) add(o,'warning','outside_canvas','El rectángulo transformado está completamente fuera del lienzo.','Revisa posición y rotación; la geometría usa las dimensiones declaradas.')
    if (o.type!=='text') continue
    if (!contains(page,b)) add(o,'warning','text_outside_page','El área declarada del texto sale de la página. Medición aproximada de glifos.','Comprueba el texto multilínea, la fuente y su variante en el editor.')
    if (Math.max(document.page.width,document.page.height)>1000 && o.fontSize*(o.scaleY??1)<24) {
      add(o,'info','small_text','El tamaño vertical efectivo del texto es inferior a 24 px.','Revisa legibilidad; puede ser intencional para texto secundario. Convención: fontSize × scaleY.')
    }
    let background = document.page.background, ambiguous = !contains(page,b)||Boolean(document.page.backgroundPaint)
    for (const lower of objects.slice(0,index)) {
      if (lower.hidden || lower.opacity===0 || !overlaps(b,studioBounds(lower))) continue
      // Only a fully covering, opaque, axis-aligned solid rectangle gives a
      // provable background. A later such rectangle occludes earlier ambiguity.
      if (lower.type==='rectangle' && (lower.opacity??1)===1 && lower.rotation%180===0 && (!lower.fillPaint||lower.fillPaint.type==='solid') && lower.shape?.fillEnabled!==false && !lower.shape?.radius && !lower.shape?.strokeWidth && contains(studioBounds(lower),b)) {
        background=lower.fillPaint?.color??lower.fill; ambiguous=false
      } else ambiguous=true
    }
    if (ambiguous || (o.opacity??1)!==1) {
      add(o,'info','requires_manual_review','El contraste depende de imágenes, capas, transparencia o geometría compleja.','Comprueba el contraste visual en el renderer; no se calcularon píxeles.')
    } else {
      const ratio=studioContrast(o.fill,background)
      if (ratio<4.5) add(o,'warning','low_contrast',`Contraste de colores sólidos ${ratio.toFixed(2)}:1, inferior a 4.5:1 (WCAG AA, texto normal).`,'Ajusta el color del texto o su fondo. La cobertura real de glifos requiere revisión visual.')
    }
  }
  return {findings,informational:true,geometry:'Rectángulos declarados con escala y rotación; métricas de texto aproximadas, sin rasterización.'}
}
