export const IMAGE_MASKS = Object.freeze(['rectangle','rounded','circle','ellipse','arch','star','triangle'])
export const DEFAULT_IMAGE = Object.freeze({mask:'rectangle',radius:24,fit:'cover',offsetX:0,offsetY:0,zoom:1,rotation:0,flipX:false,flipY:false,
  crop:{x:0,y:0,width:1,height:1},border:{width:0,color:'#000000'},shadow:{blur:0,offsetX:0,offsetY:0,color:'#000000'},
  adjustments:{brightness:0,contrast:0,saturation:0,blur:0,grayscale:false,sepia:false}})
const invalid=()=>{throw Error('Propiedades de imagen no válidas.')}
const number=(value,fallback,min,max)=>{const v=value??fallback;if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)invalid();return v}
const boolean=(value,fallback=false)=>{if(value!==undefined&&typeof value!=='boolean')invalid();return value??fallback}
const color=(value,fallback='#000000')=>{if(value!==undefined&&!/^#[a-f\d]{6}$/i.test(value))invalid();return value??fallback}
export function imageProperties(input={}) {
  if(!input||typeof input!=='object'||Array.isArray(input))invalid()
  const mask=input.mask??'rectangle',fit=input.fit??'cover'
  if(!IMAGE_MASKS.includes(mask)||!['cover','contain'].includes(fit))invalid()
  const c=input.crop??{},b=input.border??{},s=input.shadow??{},a=input.adjustments??{}
  const crop={x:number(c.x,0,0,1),y:number(c.y,0,0,1),width:number(c.width,1,0.001,1),height:number(c.height,1,0.001,1)}
  if(crop.x+crop.width>1.000001||crop.y+crop.height>1.000001)invalid()
  return {mask,fit,radius:number(input.radius,24,0,2048),offsetX:number(input.offsetX,0,-4,4),offsetY:number(input.offsetY,0,-4,4),
    zoom:number(input.zoom,1,0.1,8),rotation:number(input.rotation,0,-360,360),flipX:boolean(input.flipX),flipY:boolean(input.flipY),crop,
    border:{width:number(b.width,0,0,128),color:color(b.color)},shadow:{blur:number(s.blur,0,0,128),offsetX:number(s.offsetX,0,-512,512),offsetY:number(s.offsetY,0,-512,512),color:color(s.color)},
    adjustments:{brightness:number(a.brightness,0,-1,1),contrast:number(a.contrast,0,-1,1),saturation:number(a.saturation,0,-1,1),blur:number(a.blur,0,0,1),grayscale:boolean(a.grayscale),sepia:boolean(a.sepia)}}
}
