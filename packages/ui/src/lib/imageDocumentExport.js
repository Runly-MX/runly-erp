import { canvasToFile, cropRect, renderTransformed, workSourceSize } from './imageEdit.js'
import {canvasSize} from './imageGeometry.js'
import { drawAnnotations } from './imageAnnotations.js'
import { drawLayers } from './imageLayers.js'
import { applyFx } from './imageFx.js'

// Opt-in full-resolution export. Legacy Files/Notes retain their 1800px workflow.
export async function exportImageDocument(source, doc, { originalResolution = false, fileName = 'imagen', mimeType = 'image/png' } = {}) {
  if (originalResolution && (source.naturalWidth > 8192 || source.naturalHeight > 8192 || source.naturalWidth * source.naturalHeight > 25_000_000)) throw Error('El original supera 25 megapíxeles o 8192 px por lado.');
  if(doc.layers.length>16||doc.annotations.length>500||doc.annotations.reduce((count,a)=>count+(a.points?.length??0),0)>100000)throw Error('La composición supera los límites de procesamiento.');
  if(doc.layers.reduce((count,layer)=>count+layer.img.naturalWidth*layer.img.naturalHeight,0)>50_000_000)throw Error('Las capas superan 50 megapíxeles de memoria de trabajo.');
  const work = canvasSize(workSourceSize(source), doc.transform);
  const k = originalResolution ? Math.max(1, Math.max(source.naturalWidth, source.naturalHeight) / 1800) : 1;
  const flat = renderTransformed(source, { ...doc.transform, adjust: { ...doc.adjust, blur: (doc.adjust?.blur ?? 0) * k }, filter: doc.filter, maxSide: originalResolution ? 8192 : 1800 });
  const sx = flat.width / work.w, sy = flat.height / work.h;
  const strokes = doc.annotations.filter(a => a.type === 'fx').map(a => ({ ...a, points: a.points.map(([x, y]) => [x * sx, y * sy]), size: a.size * k, pixelScale: k }));
  const retouched = strokes.length ? applyFx(flat, strokes) : flat;
  const ctx = retouched.getContext('2d');
  ctx.save(); ctx.scale(sx, sy); drawLayers(ctx, doc.layers); drawAnnotations(ctx, doc.annotations); ctx.restore();
  const c = doc.cropN;
  if (![c.x,c.y,c.w,c.h].every(Number.isFinite) || c.x < 0 || c.y < 0 || c.w <= 0 || c.h <= 0 || c.x + c.w > 1.000001 || c.y + c.h > 1.000001) throw Error('Recorte no válido.');
  const out = c.x === 0 && c.y === 0 && c.w === 1 && c.h === 1 ? retouched : cropRect(retouched, { x: c.x * retouched.width, y: c.y * retouched.height, w: c.w * retouched.width, h: c.h * retouched.height });
  const erased = doc.annotations.some(a => a.type === 'fx' && a.mode === 'erase');
  const type = erased || mimeType === 'image/png' || mimeType === 'image/gif' || doc.transform.angle !== 0 ? 'image/png' : mimeType === 'image/webp' ? 'image/webp' : 'image/jpeg';
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  try { return await canvasToFile(out, { name: `${fileName.replace(/\.[^.]+$/, '')}-editada.${ext}`, type }); }
  finally { for (const canvas of new Set([flat, retouched, out])) { canvas.width = 0; canvas.height = 0; } }
}
