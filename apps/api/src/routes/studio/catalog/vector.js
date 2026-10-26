import { validateGeometry } from '../../../../../shared/studio/vector.js'
// A deliberately small SVG grammar, not a sanitizer for arbitrary SVG documents.
const paint = new Set(['fill','stroke','stroke-width','stroke-linecap','stroke-linejoin'])
const geometryKeys = { path:['d'], line:['x1','y1','x2','y2'], polyline:['points'], polygon:['points'], rect:['x','y','width','height','rx','ry'], circle:['cx','cy','r'], ellipse:['cx','cy','rx','ry'], g:[] }
const fail = () => { throw new Error('Este icono contiene geometría no compatible.') }
const numeric = (a,key,fallback=0) => { const n = a[key] === undefined ? fallback : Number(a[key]); if (!Number.isFinite(n) || Math.abs(n)>4096) fail(); return n }
export function iconGeometry(body,width=24,height=24) {
  if (typeof body !== 'string' || body.length > 32768 || /[&!?:]/.test(body)) fail()
  const stack = [{ fill:'currentColor', stroke:'none','stroke-width':'1','stroke-linecap':'butt','stroke-linejoin':'miter' }], paths=[]
  let rest = body.trim(), count=0
  while (rest) {
    const tag=rest.match(/^<(\/)?([a-z]+)((?:\s+[a-z-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/)
    if (!tag || ++count > 256) fail()
    rest=rest.slice(tag[0].length).trim()
    const [,close,name,attributes,selfClose]=tag
    if (!geometryKeys[name]) fail()
    if (close) { if (name!=='g' || attributes || selfClose || stack.length===1) fail();stack.pop();continue }
    const own={}
    for (const match of attributes.matchAll(/([a-z-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
      const key=match[1];if (key in own || (!paint.has(key) && !geometryKeys[name].includes(key))) fail()
      own[key]=match[2]??match[3]
    }
    const a={...stack.at(-1),...own}
    if (!['none','currentColor'].includes(a.fill) || !['none','currentColor'].includes(a.stroke)) fail()
    if (name==='g') { if (!selfClose) { if(stack.length>=12)fail();stack.push(a) };continue }
    if (!selfClose) fail()
    let d
    if(name==='path') d=a.d
    if(name==='line') d=`M${numeric(a,'x1')} ${numeric(a,'y1')}L${numeric(a,'x2')} ${numeric(a,'y2')}`
    if(name==='polyline'||name==='polygon') {
      const points=String(a.points??'').trim().split(/[\s,]+/).map(Number)
      if(points.length<4||points.length%2||points.length>512||points.some(n=>!Number.isFinite(n)||Math.abs(n)>4096))fail()
      d=`M${points.slice(0,2).join(' ')}L${points.slice(2).join(' ')}${name==='polygon'?'Z':''}`
    }
    if(name==='rect') {
      const x=numeric(a,'x'),y=numeric(a,'y'),w=numeric(a,'width'),h=numeric(a,'height'),rx=numeric(a,'rx'),ry=numeric(a,'ry',rx)
      if(w<=0||h<=0||rx<0||ry<0||rx>w/2||ry>h/2)fail()
      d=rx||ry?`M${x+rx} ${y}H${x+w-rx}Q${x+w} ${y} ${x+w} ${y+ry}V${y+h-ry}Q${x+w} ${y+h} ${x+w-rx} ${y+h}H${x+rx}Q${x} ${y+h} ${x} ${y+h-ry}V${y+ry}Q${x} ${y} ${x+rx} ${y}Z`:`M${x} ${y}h${w}v${h}h${-w}Z`
    }
    if(name==='circle'||name==='ellipse') {
      const cx=numeric(a,'cx'),cy=numeric(a,'cy'),rx=numeric(a,name==='circle'?'r':'rx'),ry=name==='circle'?rx:numeric(a,'ry')
      if(rx<=0||ry<=0)fail()
      d=`M${cx-rx} ${cy}A${rx} ${ry} 0 1 0 ${cx+rx} ${cy}A${rx} ${ry} 0 1 0 ${cx-rx} ${cy}Z`
    }
    paths.push({d,fill:a.fill==='none'?'none':'color',stroke:a.stroke==='none'?'none':'color',strokeWidth:numeric(a,'stroke-width',1),cap:a['stroke-linecap'],join:a['stroke-linejoin']})
  }
  if(stack.length!==1)fail()
  return validateGeometry({width,height,paths})
}
