// Heads can extend across the line normal; their longitudinal size is bounded.
// Skip coincident vertices and bound heads by the adjacent segment length.
export function lineCapPath(points,end,kind,strokeWidth) {
  if(!kind||kind==='none')return null
  const tip=end==='start'?points[0]:points.at(-1), ordered=end==='start'?points.slice(1):points.slice(0,-1).reverse()
  const from=ordered.find(p=>Math.hypot(p[0]-tip[0],p[1]-tip[1])>0.001)
  if(!from)return null
  const distance=Math.hypot(tip[0]-from[0],tip[1]-from[1]),size=Math.min(Math.max(10,strokeWidth*4),distance*0.45)
  const angle=Math.atan2(tip[1]-from[1],tip[0]-from[0]),c=Math.cos(angle),s=Math.sin(angle)
  const at=(x,y)=>`${tip[0]+x*c-y*s} ${tip[1]+x*s+y*c}`
  if(kind==='arrow'||kind==='open-arrow')return {d:`M${at(-size,-size*0.45)} L${at(0,0)} L${at(-size,size*0.45)}${kind==='arrow'?' Z':''}`,filled:kind==='arrow'}
  if(kind==='bar')return {d:`M${at(0,-size/2)} L${at(0,size/2)}`,filled:false}
  if(kind==='circle')return {d:`M${at(0,0)} A${size/2} ${size/2} 0 1 0 ${at(-size,0)} A${size/2} ${size/2} 0 1 0 ${at(0,0)} Z`,filled:true}
  const vertices=kind==='diamond'?[[0,0],[-size/2,-size/2],[-size,0],[-size/2,size/2]]:[[0,-size/2],[-size,-size/2],[-size,size/2],[0,size/2]]
  return {d:vertices.map(([x,y],i)=>`${i?'L':'M'}${at(x,y)}`).join(' ')+' Z',filled:true}
}
