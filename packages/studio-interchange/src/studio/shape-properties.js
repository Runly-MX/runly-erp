import { imageProperties } from './image-properties.js'
import { gradientPaint } from './gradient.js'

export const LINE_CAPS = Object.freeze(['none','arrow','open-arrow','circle','square','bar','diamond'])
export const SHAPE_TYPES = Object.freeze(['rectangle','ellipse','vector'])
const number = (n,min,max) => typeof n==='number' && Number.isFinite(n) && n>=min && n<=max
const color = n => typeof n==='string' && /^#[0-9a-f]{6}$/i.test(n)
const invalid = () => { throw Error('Estilo de forma no admitido.') }
export function photoFileId(object) {
  return object.type==='image' ? object.fileAssetId : object.fillPaint?.type==='image' ? object.fillPaint.fileAssetId : null
}
export const documentAssetIds = document => [...new Set([document, ...(document.additionalPages??[])].flatMap(scene=>(scene.objects??[]).map(photoFileId)).filter(Boolean))]
// A single closed filled path preserves SVG nonzero holes exactly. Multiple
// independent paths need a real boolean union before they can be one silhouette.
export function supportsPhotoFill(object) {
  return ['rectangle','ellipse'].includes(object.type) || (object.type==='vector' && object.geometry.paths.length===1 && object.geometry.paths.every(p=>p.fill==='color' && p.stroke==='none' && p.d.split(/(?=[Mm])/).filter(Boolean).every(part=>/[zZ]\s*$/.test(part))))
}
export function shapeStyle(value={}) {
  if(!value||typeof value!=='object'||Array.isArray(value))invalid()
  const style={fillEnabled:true,strokeWidth:0,strokeColor:'#000000',dash:'solid',strokeAlign:'center',radius:0,...value}
  if(typeof style.fillEnabled!=='boolean'||!number(style.strokeWidth,0,128)||!color(style.strokeColor)||!['solid','dashed','dotted'].includes(style.dash)||style.strokeAlign!=='center'||!number(style.radius,0,2048))invalid()
  return Object.fromEntries(['fillEnabled','strokeWidth','strokeColor','dash','strokeAlign','radius'].map(k=>[k,style[k]]))
}
export function fillPaint(value,filePattern) {
  if(!value||!['solid','image','gradient'].includes(value.type))invalid()
  if(value.type==='gradient')return gradientPaint(value)
  if(value.type==='solid'){if(!color(value.color))invalid();return {type:'solid',color:value.color}}
  if(typeof value.fileAssetId!=='string'||!filePattern.test(value.fileAssetId))invalid()
  const image=imageProperties(value.image)
  if(image.mask!=='rectangle'||image.radius!==24||image.border.width!==0)invalid()
  return {type:'image',fileAssetId:value.fileAssetId.toLowerCase(),image}
}
