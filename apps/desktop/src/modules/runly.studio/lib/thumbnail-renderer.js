import { StudioPhoto, createStudioPhoto } from './studio-photo.js'
import { StudioLine } from './studio-line.js'
import { photoFileId } from '../../../../../shared/studio/shape-properties.js'

// Preview pixels only; never serialize these URLs into a document or a template.
export async function renderThumbnailItem(item,url) {
  let object
  try {
    if(item.type==='line')object=new StudioLine({...item,scaleX:1,scaleY:1})
    else if(photoFileId(item))object=await createStudioPhoto(item,async()=>url)
    else object=new StudioPhoto(item,null)
    const shadow=item.type==='image'?item.image?.shadow:item.fillPaint?.image?.shadow
    const padding=Math.ceil(Math.max(2,(item.shape?.strokeWidth??item.image?.border?.width??item.strokeWidth??0)*2,(shadow?.blur??0)*2+Math.max(Math.abs(shadow?.offsetX??0),Math.abs(shadow?.offsetY??0))))
    const canvas=document.createElement('canvas'),k=Math.min(1,384/Math.max(item.width+padding*2,item.height+padding*2))
    canvas.width=Math.ceil((item.width+padding*2)*k);canvas.height=Math.ceil((item.height+padding*2)*k)
    const ctx=canvas.getContext('2d');ctx.scale(k,k)
    object.set({left:padding,top:padding,angle:0,opacity:1})
    object.render(ctx)
    const result={url:canvas.toDataURL(),padding};canvas.width=0;canvas.height=0;return result
  } finally {object?.dispose()}
}
