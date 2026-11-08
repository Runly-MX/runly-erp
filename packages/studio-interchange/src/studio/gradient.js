// Canonical paint, independent of Fabric, DOM and CSS. Conic is deliberately unsupported.
const finite = (v,min,max) => typeof v==='number' && Number.isFinite(v) && v>=min && v<=max
const invalid = () => { throw Error('Degradado no válido.') }
export const DEFAULT_GRADIENT = Object.freeze({type:'gradient',gradientType:'linear',angle:0,stops:Object.freeze([
  Object.freeze({offset:0,color:'#d946ef',opacity:1}),Object.freeze({offset:1,color:'#7945f5',opacity:1}),
])})
export function gradientPaint(value) {
  if(!value||value.type!=='gradient'||!['linear','radial'].includes(value.gradientType)||!Array.isArray(value.stops)||value.stops.length<2||value.stops.length>12)invalid()
  let previous=-1
  const stops=value.stops.map(stop=>{
    if(!stop||!finite(stop.offset,0,1)||stop.offset<=previous||typeof stop.color!=='string'||!/^#[0-9a-f]{6}$/i.test(stop.color)||!finite(stop.opacity,0,1))invalid()
    previous=stop.offset;return {offset:stop.offset,color:stop.color.toLowerCase(),opacity:stop.opacity}
  })
  if(value.gradientType==='linear'){
    if(!finite(value.angle,-360,360))invalid()
    return {type:'gradient',gradientType:'linear',angle:value.angle,stops}
  }
  if(!finite(value.centerX,0,1)||!finite(value.centerY,0,1)||!finite(value.radius,0.01,2))invalid()
  return {type:'gradient',gradientType:'radial',centerX:value.centerX,centerY:value.centerY,radius:value.radius,stops}
}
// Top-left local coordinates, clockwise degrees: 0 left→right, 90 top→bottom.
// Linear endpoints span the rectangle's projection. Radial radius uses min(w,h).
export function gradientGeometry(paint,width,height) {
  if(paint.gradientType==='radial')return {x1:paint.centerX*width,y1:paint.centerY*height,r1:0,x2:paint.centerX*width,y2:paint.centerY*height,r2:paint.radius*Math.min(width,height)}
  const a=paint.angle*Math.PI/180,c=Math.cos(a),s=Math.sin(a),r=(Math.abs(width*c)+Math.abs(height*s))/2
  return {x1:width/2-c*r,y1:height/2-s*r,x2:width/2+c*r,y2:height/2+s*r}
}
export function gradientColor(stop) {
  const [r,g,b]=stop.color.slice(1).match(/../g).map(n=>parseInt(n,16))
  return `rgba(${r},${g},${b},${stop.opacity})`
}
export function canvasGradient(ctx,paint,width,height,centered=false) {
  const g=gradientGeometry(paint,width,height),x=centered?width/2:0,y=centered?height/2:0
  const result=paint.gradientType==='linear'?ctx.createLinearGradient(g.x1-x,g.y1-y,g.x2-x,g.y2-y):ctx.createRadialGradient(g.x1-x,g.y1-y,0,g.x2-x,g.y2-y,g.r2)
  for(const stop of paint.stops)result.addColorStop(stop.offset,gradientColor(stop))
  return result
}
export function editGradientStop(paint,index,patch) {
  paint=gradientPaint(paint)
  if(!Number.isInteger(index)||index<0||index>=paint.stops.length)invalid()
  const stops=paint.stops.map((s,i)=>i===index?{...s,...patch}:s).sort((a,b)=>a.offset-b.offset)
  return gradientPaint({...paint,stops})
}
export function reverseGradient(paint) {
  paint=gradientPaint(paint)
  return gradientPaint({...paint,stops:paint.stops.map(s=>({...s,offset:1-s.offset})).reverse()})
}
