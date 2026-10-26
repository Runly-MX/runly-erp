import { imageProperties } from './image-properties.js'

export const LINE_CAPS = Object.freeze(['none','arrow','open-arrow','circle','square','bar','diamond'])
export const SHAPE_TYPES = Object.freeze(['rectangle','ellipse','vector'])
const number = (n,min,max) => typeof n==='number' && Number.isFinite(n) && n>=min && n<=max
const color = n => typeof n==='string' && /^#[0-9a-f]{6}$/i.test(n)
const invalid = () => { throw Error('Estilo de forma no admitido.') }
export function photoFileId(object) {
  return object.type==='image' ? object.fileAssetId : object.fillPaint?.type==='image' ? object.fillPaint.fileAssetId : null
}
export const documentAssetIds = document => [...new Set((document.objects??[]).map(photoFileId).filter(Boolean))]
// Open stroke-only icons are not photo silhouettes. Keep their original paths.
export function supportsPhotoFill(object) {
  return ['rectangle','ellipse'].includes(object.type) || (object.type==='vector' && object.geometry.paths.every(p=>p.fill==='color' && p.stroke==='none'))
}
export function shapeStyle(value={}) {
  if(!value||typeof value!=='object'||Array.isArray(value))invalid()
  const style={fillEnabled:true,strokeWidth:0,strokeColor:'#000000',dash:'solid',strokeAlign:'center',radius:0,...value}
  if(typeof style.fillEnabled!=='boolean'||!number(style.strokeWidth,0,128)||!color(style.strokeColor)||!['solid','dashed','dotted'].includes(style.dash)||style.strokeAlign!=='center'||!number(style.radius,0,2048))invalid()
  return Object.fromEntries(['fillEnabled','strokeWidth','strokeColor','dash','strokeAlign','radius'].map(k=>[k,style[k]]))
}
export function fillPaint(value,filePattern) {
  if(!value||!['solid','image'].includes(value.type))invalid()
  if(value.type==='solid'){if(!color(value.color))invalid();return {type:'solid',color:value.color}}
  if(typeof value.fileAssetId!=='string'||!filePattern.test(value.fileAssetId))invalid()
  const image=imageProperties(value.image)
  if(image.mask!=='rectangle'||image.radius!==24||image.border.width!==0)invalid()
  return {type:'image',fileAssetId:value.fileAssetId.toLowerCase(),image}
}
