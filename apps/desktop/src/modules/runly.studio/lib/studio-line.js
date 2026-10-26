import {lineCapPath} from '../../../../../shared/studio/line-caps.js'
import {FabricObject} from 'fabric'
export class StudioLine extends FabricObject {
  constructor(item) {
    super({left:item.x,top:item.y,width:item.width,height:item.height,scaleX:item.scaleX,scaleY:item.scaleY,angle:item.rotation,fill:item.fill,
      originX:'left',originY:'top',strokeWidth:0,objectCaching:false})
    this.configure(item)
  }
  configure(item){this.properties=item;this.set('dirty',true)}
  _render(ctx){
    const p=this.properties,points=p.points.map(([x,y])=>[(x-0.5)*this.width,(y-0.5)*this.height])
    ctx.save();ctx.strokeStyle=this.fill;ctx.fillStyle=this.fill;ctx.lineWidth=p.strokeWidth;ctx.lineCap=p.dash==='dotted'?'round':'butt'
    ctx.setLineDash(p.dash==='dashed'?[p.strokeWidth*4,p.strokeWidth*3]:p.dash==='dotted'?[0.01,p.strokeWidth*2.5]:[])
    ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.setLineDash([])
    for(const end of ['start','end']){const cap=lineCapPath(points,end,p[end+'Cap']??(p[end+'Arrow']?'arrow':'none'),p.strokeWidth);if(cap){const path=new Path2D(cap.d);cap.filled?ctx.fill(path):ctx.stroke(path)}}
    ctx.restore()
  }
}
