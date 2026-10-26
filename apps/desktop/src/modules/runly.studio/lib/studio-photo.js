import { FabricObject, FabricImage, Shadow, filters, Canvas2dFilterBackend } from 'fabric'
import { shapeStyle, photoFileId } from '../../../../../shared/studio/shape-properties.js'
import { imageProperties } from '../../../../../shared/studio/image-properties.js'
import { canvasGradient } from '../../../../../shared/studio/gradient.js'

function mask(ctx,kind,w,h,radius) {
  ctx.beginPath()
  const x=-w/2,y=-h/2
  if(kind==='circle'||kind==='ellipse'){ctx.ellipse(0,0,kind==='circle'?Math.min(w,h)/2:w/2,kind==='circle'?Math.min(w,h)/2:h/2,0,0,Math.PI*2);return}
  if(kind==='triangle'){ctx.moveTo(0,y);ctx.lineTo(w/2,h/2);ctx.lineTo(x,h/2);ctx.closePath();return}
  if(kind==='star'){
    for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,k=i%2?0.45:1;const px=Math.cos(a)*w/2*k,py=Math.sin(a)*h/2*k;i?ctx.lineTo(px,py):ctx.moveTo(px,py)}
    ctx.closePath();return
  }
  if(kind==='arch'){ctx.moveTo(x,h/2);ctx.lineTo(x,0);ctx.bezierCurveTo(x,-h*2/3,w/2,-h*2/3,w/2,0);ctx.lineTo(w/2,h/2);ctx.closePath();return}
  if(kind==='rounded'){ctx.roundRect(x,y,w,h,Math.min(radius,w/2,h/2));return}
  ctx.rect(x,y,w,h)
}

// User frames are canonical image objects. This render object is never a user group.
export class StudioPhoto extends FabricObject {
  constructor(item,image) {
    super({left:item.x,top:item.y,width:item.width,height:item.height,angle:item.rotation,fill:item.fill,originX:'left',originY:'top',strokeWidth:0,objectCaching:false})
    this.original=image;this.filterBackend=new Canvas2dFilterBackend();this.configure(item)
  }
  configure(item) {
    const next=imageProperties(item.type==='image'?item.image:item.fillPaint?.image)
    this.item=item;this.shape=item.type!=='image'?shapeStyle(item.shape):null
    if(JSON.stringify(next.adjustments)!==JSON.stringify(this.properties?.adjustments)){
      const a=next.adjustments,list=[]
      if(a.brightness)list.push(new filters.Brightness({brightness:a.brightness}))
      if(a.contrast)list.push(new filters.Contrast({contrast:a.contrast}))
      if(a.saturation)list.push(new filters.Saturation({saturation:a.saturation}))
      if(a.grayscale)list.push(new filters.Grayscale())
      if(a.sepia)list.push(new filters.Sepia())
      if(a.blur)list.push(new filters.Blur({blur:a.blur}))
      if(list.length&&this.original){
        const element=this.original.getElement()
        this.filtered??=document.createElement('canvas');this.filtered.width=this.original.width;this.filtered.height=this.original.height
        // A private 2D backend avoids GPU texture-size limits and global backend mutations.
        this.filterBackend.applyFilters(list,element,this.original.width,this.original.height,this.filtered)
      }else if(this.filtered){this.filtered.width=0;this.filtered.height=0;this.filtered=null}
    }
    this.properties=next
    this.set({width:item.width,height:item.height,opacity:item.opacity??1,shadow:next.shadow.blur||next.shadow.offsetX||next.shadow.offsetY?new Shadow({...next.shadow,affectStroke:true}):null,dirty:true})
  }
  _render(ctx) {
    const p=this.properties,w=this.width,h=this.height,source=this.filtered??this.original?.getElement(),c=p.crop
    if(this.shape){this.renderShape(ctx,source);return}
    const sw=source.width*c.width,sh=source.height*c.height,k=(p.fit==='contain'?Math.min(w/sw,h/sh):Math.max(w/sw,h/sh))*p.zoom
    ctx.save();mask(ctx,p.mask,w,h,p.radius);ctx.clip()
    ctx.translate(p.offsetX*w,p.offsetY*h);ctx.rotate(p.rotation*Math.PI/180);ctx.scale(p.flipX?-1:1,p.flipY?-1:1)
    ctx.drawImage(source,c.x*source.width,c.y*source.height,sw,sh,-sw*k/2,-sh*k/2,sw*k,sh*k)
    ctx.restore()
    if(p.border.width){ctx.save();mask(ctx,p.mask,w,h,p.radius);ctx.strokeStyle=p.border.color;ctx.lineWidth=p.border.width;ctx.stroke();ctx.restore()}
  }
  shapePath() {
    const item=this.item,w=this.width,h=this.height,path=new Path2D()
    if(item.type==='ellipse')path.ellipse(0,0,w/2,h/2,0,0,Math.PI*2)
    else if(item.type==='rectangle')path.roundRect(-w/2,-h/2,w,h,Math.min(this.shape.radius,w/2,h/2))
    else for(const p of item.geometry.paths)path.addPath(new Path2D(p.d),new DOMMatrix([w/item.geometry.width,0,0,h/item.geometry.height,-w/2,-h/2]))
    return path
  }
  renderShape(ctx,source) {
    const p=this.properties,w=this.width,h=this.height,style=this.shape,path=this.shapePath()
    if(style.fillEnabled){
      if(source){
        const c=p.crop,sw=source.width*c.width,sh=source.height*c.height,k=(p.fit==='contain'?Math.min(w/sw,h/sh):Math.max(w/sw,h/sh))*p.zoom
        ctx.save();ctx.clip(path);ctx.translate(p.offsetX*w,p.offsetY*h);ctx.rotate(p.rotation*Math.PI/180);ctx.scale(p.flipX?-1:1,p.flipY?-1:1)
        ctx.drawImage(source,c.x*source.width,c.y*source.height,sw,sh,-sw*k/2,-sh*k/2,sw*k,sh*k);ctx.restore()
      }else{ctx.fillStyle=this.item.fillPaint?.type==='gradient'?canvasGradient(ctx,this.item.fillPaint,w,h,true):(this.item.fillPaint?.color??this.fill);ctx.fill(path)}
    }
    if(style.strokeWidth){ctx.save();ctx.lineWidth=style.strokeWidth;ctx.strokeStyle=style.strokeColor;ctx.lineJoin='round';ctx.lineCap=style.dash==='dotted'?'round':'butt'
      ctx.setLineDash(style.dash==='dashed'?[style.strokeWidth*4,style.strokeWidth*3]:style.dash==='dotted'?[0.01,style.strokeWidth*2.5]:[]);ctx.stroke(path);ctx.restore()}
  }
  dispose() {if(this.filtered){this.filtered.width=0;this.filtered.height=0}for(const canvas of Object.values(this.filterBackend.resources)){if(canvas&&'width'in canvas){canvas.width=0;canvas.height=0}}this.original?.dispose();super.dispose()}
}
export async function createStudioPhoto(item,resolveImage,onLoad=()=>{}) {
  const image=await FabricImage.fromURL(await resolveImage(photoFileId(item)),{crossOrigin:'anonymous'})
  if(!image.width||!image.height||image.width>8192||image.height>8192||image.width*image.height>25_000_000){image.dispose();throw Error('La imagen supera 25 megapíxeles o 8192 px por lado.')}
  try{onLoad(image);return new StudioPhoto(item,image)}catch(error){image.dispose();throw error}
}
