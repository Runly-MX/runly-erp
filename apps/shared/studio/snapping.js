// Bounded, gesture-local index. No Board models or renderer dependency.
export const DEFAULT_SNAPPING = Object.freeze({enabled:true,page:true,objects:true,grid:false,threshold:6})
export const DEFAULT_GRID = Object.freeze({visible:false,size:20,rulers:false})
export function snappingOptions(value={}) {
  const result={...DEFAULT_SNAPPING,...value}
  for(const k of ['enabled','page','objects','grid'])if(typeof result[k]!=='boolean')throw Error('Opción de snapping no válida.')
  if(!Number.isFinite(result.threshold)||result.threshold<0||result.threshold>24)throw Error('Umbral no válido.')
  return Object.fromEntries(Object.keys(DEFAULT_SNAPPING).map(k=>[k,result[k]]))
}
export function gridOptions(value={}) {
  const result={...DEFAULT_GRID,...value}
  if(typeof result.visible!=='boolean'||typeof result.rulers!=='boolean'||!Number.isFinite(result.size)||result.size<2||result.size>1024)throw Error('Cuadrícula no válida.')
  return {visible:result.visible,size:result.size,rulers:result.rulers}
}
export function createSnapIndex(page,boxes,excluded=[]) {
  const omit=new Set(excluded),refs=boxes.filter(b=>!omit.has(b.id)&&!b.hidden).slice(0,500)
  const axes={x:[],y:[]},pairs={x:[],y:[]}
  for(const [axis,start,size]of [['x','left','width'],['y','top','height']]){
    axes[axis].push(...[0,page[size]/2,page[size]].map(value=>({value,kind:'page'})))
    for(const b of refs)for(const value of [b[start],b[start]+b[size]/2,b[start]+b[size]])axes[axis].push({value,kind:'object',id:b.id})
    axes[axis].sort((a,b)=>a.value-b.value)
    const ordered=[...refs].sort((a,b)=>a[start]-b[start])
    for(let i=1;i<ordered.length;i++){
      const a=ordered[i-1],b=ordered[i]
      if(a[start]+a[size]<=b[start])pairs[axis].push({a,b})
    }
  }
  return {axes,pairs}
}
function nearby(sorted,value,threshold) {
  let lo=0,hi=sorted.length
  while(lo<hi){const mid=(lo+hi)>>1;if(sorted[mid].value<value-threshold)lo=mid+1;else hi=mid}
  const result=[];for(let i=lo;i<sorted.length&&sorted[i].value<=value+threshold;i++)result.push(sorted[i])
  return result
}
export function snapBounds(index,box,{zoom=1,disabled=false,options=DEFAULT_SNAPPING,grid=DEFAULT_GRID}={}) {
  if(!Number.isFinite(zoom)||zoom<=0)throw Error('Zoom no válido.')
  if(disabled||!options.enabled)return {dx:0,dy:0,guides:[]}
  const threshold=options.threshold/zoom,result={dx:0,dy:0,guides:[]}
  for(const [axis,start,size,cross,crossSize,delta]of [['x','left','width','top','height','dx'],['y','top','height','left','width','dy']]){
    let best=null
    const consider=(distance,guide)=>{if(Math.abs(distance)<=threshold&&(!best||Math.abs(distance)<Math.abs(best.distance)))best={distance,guide}}
    for(const anchor of [box[start],box[start]+box[size]/2,box[start]+box[size]]){
      for(const ref of nearby(index.axes[axis],anchor,threshold))if(options[ref.kind==='page'?'page':'objects'])consider(ref.value-anchor,{axis,position:ref.value,kind:ref.kind,id:ref.id})
    }
    if(options.objects)for(const {a,b}of index.pairs[axis]){
      const gap=b[start]-a[start]-a[size]
      // Equal spacing between two non-overlapping neighbors with shared cross coverage.
      if(gap>=box[size]&&[a,b].every(r=>box[cross]<r[cross]+r[crossSize]&&box[cross]+box[crossSize]>r[cross])){
        const position=(a[start]+a[size]+b[start]-box[size])/2
        consider(position-box[start],{axis,position,kind:'spacing',gap:(gap-box[size])/2,ids:[a.id,b.id]})
      }
    }
    // Same pure nearest-multiple algorithm as Canvas snapValue, independent of Board settings.
    if(options.grid) {const position=Math.round(box[start]/grid.size)*grid.size;consider(position-box[start],{axis,position,kind:'grid'})}
    if(best){result[delta]=best.distance;result.guides.push(best.guide)}
  }
  return result
}
// Visible ruler/grid coordinates only; callers render an overlay outside the artwork.
export function viewportReferences(page,{zoom=1,panX=0,panY=0}={},grid=DEFAULT_GRID) {
  if(![zoom,panX,panY].every(Number.isFinite)||zoom<0.01||zoom>64)throw Error('Viewport no válido.')
  const step=grid.size*Math.max(1,Math.ceil(8/(grid.size*zoom)))
  const ticks=(side,pan)=>Array.from({length:Math.min(2049,Math.floor(side/step)+1)},(_,i)=>({value:i*step,screen:i*step*zoom+pan}))
  return {zoom,panX,panY,grid:{...grid,displayStep:step},x:ticks(page.width,panX),y:ticks(page.height,panY)}
}
