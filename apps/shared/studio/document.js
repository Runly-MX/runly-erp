// Internal Runly document contract. No renderer, browser or persistence dependency.
import { validStudioFont, studioFontStyle } from './fonts.js'
import { validateGeometry } from './vector.js'
import { iconSource } from './licenses.js'
import { imageProperties } from './image-properties.js'
import { gradientPaint } from './gradient.js'
import { fillPaint, shapeStyle, supportsPhotoFill, SHAPE_TYPES, LINE_CAPS } from './shape-properties.js'
export const STUDIO_SCHEMA_VERSION = 6
export const STUDIO_LIMITS = Object.freeze({ side: 4096, objects: 500, bytes: 1_000_000 })
export const FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COLOR = /^#[0-9a-f]{6}$/i
const isColor = value => typeof value === 'string' && COLOR.test(value)
const TYPES = new Set(['text', 'rectangle', 'ellipse', 'image', 'vector', 'line'])

export class StudioError extends Error {
  constructor(message, status = 400, code = 'STUDIO_INVALID') {
    super(message); this.status = status; this.code = code
  }
}
const fail = () => { throw new StudioError('El diseño contiene datos no válidos o supera los límites permitidos.') }
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max

export function validateDocument(input) {
  if (!input || ![1, 2, 3, 4, 5, STUDIO_SCHEMA_VERSION].includes(input.schemaVersion) || input.unit !== 'px') fail()
  if (JSON.stringify(input).length > STUDIO_LIMITS.bytes) fail()
  const page = input.page
  if (!page || !Number.isInteger(page.width) || !Number.isInteger(page.height) ||
    !finite(page.width, 32, STUDIO_LIMITS.side) || !finite(page.height, 32, STUDIO_LIMITS.side) || !isColor(page.background)) fail()
  if (!Array.isArray(input.objects) || input.objects.length > STUDIO_LIMITS.objects) fail()
  let backgroundPaint
  if(page.backgroundPaint!==undefined){if(input.schemaVersion<6)fail();try{backgroundPaint=gradientPaint(page.backgroundPaint)}catch{fail()}}
  const ids = new Set()
  const objects = input.objects.map((object) => {
    if (!object || !TYPES.has(object.type) || typeof object.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(object.id) || ids.has(object.id)) fail()
    ids.add(object.id)
    for (const key of ['x', 'y']) if (!finite(object[key], -16384, 16384)) fail()
    for (const key of ['width', 'height']) if (!finite(object[key], 1, 16384)) fail()
    if (!finite(object.rotation, -360, 360) || !isColor(object.fill)) fail()
    const clean = Object.fromEntries(['id', 'type', 'x', 'y', 'width', 'height', 'rotation', 'fill'].map(key => [key, object[key]]))
    if(object.opacity!==undefined){if(!finite(object.opacity,0,1))fail();clean.opacity=object.opacity}
    if(object.groupId!==undefined){if(input.schemaVersion<4||typeof object.groupId!=='string'||!/^[a-zA-Z0-9_-]{1,64}$/.test(object.groupId))fail();clean.groupId=object.groupId}
    for (const key of ['locked', 'hidden']) {
      if (object[key] !== undefined && typeof object[key] !== 'boolean') fail()
      clean[key] = input.schemaVersion === 1 ? false : (object[key] ?? false)
    }
    if (object.type === 'text') {
      if (typeof object.text !== 'string' || object.text.length > 10000 || !finite(object.fontSize, 8, 500)) fail()
      const scaleX = object.scaleX ?? 1, scaleY = object.scaleY ?? 1
      if (!finite(scaleX, 0.02, 8) || !finite(scaleY, 0.02, 8)) fail()
      const fontFamily = input.schemaVersion < 3 ? 'sans-serif' : (object.fontFamily ?? 'sans-serif')
      const fontVariant=object.fontVariant??'regular'
      if (!validStudioFont(fontFamily) || !studioFontStyle(fontFamily,fontVariant) || (input.schemaVersion<4&&fontVariant!=='regular')) fail()
      Object.assign(clean, { text: object.text, fontSize: object.fontSize, fontFamily, fontVariant, scaleX, scaleY })
      if(input.schemaVersion>=4){
        const textAlign=object.textAlign??'left',lineHeight=object.lineHeight??1.16,charSpacing=object.charSpacing??0
        if(!['left','center','right','justify'].includes(textAlign)||!finite(lineHeight,0.5,4)||!finite(charSpacing,-200,1000))fail()
        for(const key of ['underline','linethrough']){if(object[key]!==undefined&&typeof object[key]!=='boolean')fail()}
        Object.assign(clean,{textAlign,lineHeight,charSpacing,underline:object.underline??false,linethrough:object.linethrough??false})
      }else Object.assign(clean,{textAlign:'left',lineHeight:1.16,charSpacing:0,underline:false,linethrough:false})
    }
    if (object.type === 'image') {
      if (typeof object.fileAssetId !== 'string' || !FILE_ID.test(object.fileAssetId)) fail()
      clean.fileAssetId = object.fileAssetId.toLowerCase()
      if(object.image!==undefined){if(input.schemaVersion<4)fail();try{clean.image=imageProperties(object.image)}catch{fail()}}
    }
    if(object.type==='line'){
      if(input.schemaVersion<4)fail()
      const points=object.points??[[0,0],[1,1]],strokeWidth=object.strokeWidth??2,dash=object.dash??'solid',startArrow=object.startArrow??false,endArrow=object.endArrow??false,scaleX=object.scaleX??1,scaleY=object.scaleY??1
      if(!Array.isArray(points)||points.length<2||points.length>256||!points.every(p=>Array.isArray(p)&&p.length===2&&p.every(v=>finite(v,0,1)))||!finite(strokeWidth,0.5,128)||!['solid','dashed','dotted'].includes(dash)||typeof startArrow!=='boolean'||typeof endArrow!=='boolean'||!finite(scaleX,0.02,8)||!finite(scaleY,0.02,8))fail()
      Object.assign(clean,{points:points.map(p=>[...p]),strokeWidth,dash,startArrow,endArrow,scaleX,scaleY})
      const startCap=object.startCap??(startArrow?'arrow':'none'),endCap=object.endCap??(endArrow?'arrow':'none')
      if(!LINE_CAPS.includes(startCap)||!LINE_CAPS.includes(endCap)||(input.schemaVersion<5&&(object.startCap!==undefined||object.endCap!==undefined)))fail()
      Object.assign(clean,{startCap,endCap,startArrow:startCap==='arrow',endArrow:endCap==='arrow'})
    }
    if (object.type === 'vector') {
      if (input.schemaVersion < 3) fail()
      if(object.svgName!==undefined){if(input.schemaVersion<4||typeof object.svgName!=='string'||!object.svgName||object.svgName.length>120||object.iconId!==undefined)fail();clean.svgName=object.svgName}
      else {if(!iconSource(object.iconId))fail();clean.iconId=object.iconId}
      try { clean.geometry = validateGeometry(object.geometry) } catch { fail() }
    }
    if(object.fillPaint!==undefined){
      if(input.schemaVersion<5||!SHAPE_TYPES.includes(object.type))fail()
      try{clean.fillPaint=fillPaint(object.fillPaint,FILE_ID)}catch{fail()}
      if(clean.fillPaint.type==='gradient'&&(input.schemaVersion<6||!supportsPhotoFill(clean)))fail()
      if(clean.fillPaint.type==='image'&&!supportsPhotoFill(clean))fail()
    }
    if(object.shape!==undefined){
      if(input.schemaVersion<5||!SHAPE_TYPES.includes(object.type))fail()
      try{clean.shape=shapeStyle(object.shape)}catch{fail()}
      if(object.type!=='rectangle'&&clean.shape.radius)fail()
      if(object.type==='vector'&&!supportsPhotoFill(clean))fail()
    }
    return clean
  })
  // Explicit allowlist: viewport, signed URLs and Fabric internals never persist.
  return { schemaVersion: STUDIO_SCHEMA_VERSION, unit: 'px', page: { width: page.width, height: page.height, background: page.background, ...(backgroundPaint?{backgroundPaint}:{}) }, objects }
}

export function blankDocument(width = 1080, height = 1080) {
  return validateDocument({ schemaVersion: STUDIO_SCHEMA_VERSION, unit: 'px', page: { width, height, background: '#ffffff' }, objects: [] })
}

export function appendObject(document, type, extra = {}) {
  let ordinal = document.objects.length + 1
  const ids = new Set(document.objects.map(object => object.id))
  while (ids.has(`object-${ordinal}`)) ordinal++
  const object = { id: `object-${ordinal}`, type, x: 80, y: 100, width: type === 'ellipse' ? 220 : 320, height: type === 'text' ? 100 : 220, rotation: 0, fill: '#2563eb',
    ...(type === 'text' ? { text: 'Escribe tu idea', fontSize: 48, fontFamily: 'sans-serif' } : {}), ...extra }
  return validateDocument({ ...document, objects: [...document.objects, object] })
}
