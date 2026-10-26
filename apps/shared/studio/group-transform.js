import { validateDocument } from './document.js'

// Similarity transforms are closed under the current rotation/size contract.
// Nonuniform world scaling of rotated members would require canonical skew/matrices.
export function transformStudioGroup(input,groupId,options={}) {
  if(Object.keys(options).some(k=>!['scale','rotation','dx','dy','origin'].includes(k)))throw Error('Solo se admite escala proporcional y rotación.')
  const {scale=1,rotation=0,dx=0,dy=0,origin}=options
  const document=validateDocument(input),members=document.objects.filter(o=>o.groupId===groupId)
  if(members.length<2||members.some(o=>o.locked||o.hidden))throw Error('Grupo no editable.')
  if(![scale,rotation,dx,dy].every(Number.isFinite)||scale<=0||scale>8||Math.abs(rotation)>360||!origin||![origin.x,origin.y].every(Number.isFinite))throw Error('Transformación no válida.')
  const a=rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a)
  const shadow=p=>p?{...p,blur:p.blur*scale,offsetX:p.offsetX*scale,offsetY:p.offsetY*scale}:p
  const photo=(p,shape=false)=>p?{...p,radius:shape?p.radius:p.radius*scale,border:{...p.border,width:p.border.width*scale},shadow:shadow(p.shadow)}:p
  return validateDocument({...document,objects:document.objects.map(o=>{
    if(o.groupId!==groupId)return o
    const x=(o.x-origin.x)*scale,y=(o.y-origin.y)*scale
    const next={...o,x:origin.x+x*c-y*s+dx,y:origin.y+x*s+y*c+dy,rotation:((o.rotation+rotation)%360+360)%360}
    if(['text','line'].includes(o.type)){next.scaleX=o.scaleX*scale;next.scaleY=o.scaleY*scale}
    else {next.width=o.width*scale;next.height=o.height*scale}
    if(o.shape)next.shape={...o.shape,radius:o.shape.radius*scale,strokeWidth:o.shape.strokeWidth*scale}
    if(o.image)next.image=photo(o.image)
    if(o.fillPaint?.type==='image')next.fillPaint={...o.fillPaint,image:photo(o.fillPaint.image,true)}
    return next
  })})
}
