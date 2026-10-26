import {FabricObject} from 'fabric'
export class StudioLine extends FabricObject {
  constructor(item) {
    super({left:item.x,top:item.y,width:item.width,height:item.height,scaleX:item.scaleX,scaleY:item.scaleY,angle:item.rotation,fill:item.fill,
      originX:'left',originY:'top',strokeWidth:0,objectCaching:false})
    this.configure(item)
  }
  configure(item){this.properties=item;this.set('dirty',true)}
  _render(ctx){
    const p=this.properties,points=p.points.map(([x,y])=>[(x-0.5)*this.width,(y-0.5)*this.height]),size=Math.max(10,p.strokeWidth*4)
    ctx.save();ctx.strokeStyle=this.fill;ctx.fillStyle=this.fill;ctx.lineWidth=p.strokeWidth;ctx.lineCap=p.dash==='dotted'?'round':'butt'
    ctx.setLineDash(p.dash==='dashed'?[p.strokeWidth*4,p.strokeWidth*3]:p.dash==='dotted'?[0.01,p.strokeWidth*2.5]:[])
    ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();ctx.setLineDash([])
    const arrow=(from,to)=>{const a=Math.atan2(to[1]-from[1],to[0]-from[0]);ctx.beginPath();ctx.moveTo(...to);ctx.lineTo(to[0]-size*Math.cos(a-0.45),to[1]-size*Math.sin(a-0.45));ctx.lineTo(to[0]-size*Math.cos(a+0.45),to[1]-size*Math.sin(a+0.45));ctx.closePath();ctx.fill()}
    if(p.startArrow)arrow(points[1],points[0]);if(p.endArrow)arrow(points.at(-2),points.at(-1));ctx.restore()
  }
}
