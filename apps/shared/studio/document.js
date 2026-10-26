// Internal Runly document contract. No renderer, browser or persistence dependency.
import { validStudioFont } from './fonts.js'
import { validateGeometry } from './vector.js'
import { iconSource } from './licenses.js'
export const STUDIO_SCHEMA_VERSION = 3
export const STUDIO_LIMITS = Object.freeze({ side: 4096, objects: 500, bytes: 1_000_000 })
export const FILE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COLOR = /^#[0-9a-f]{6}$/i
const isColor = value => typeof value === 'string' && COLOR.test(value)
const TYPES = new Set(['text', 'rectangle', 'ellipse', 'image', 'vector'])

export class StudioError extends Error {
  constructor(message, status = 400, code = 'STUDIO_INVALID') {
    super(message); this.status = status; this.code = code
  }
}
const fail = () => { throw new StudioError('El diseño contiene datos no válidos o supera los límites permitidos.') }
const finite = (value, min, max) => typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max

export function validateDocument(input) {
  if (!input || ![1, 2, STUDIO_SCHEMA_VERSION].includes(input.schemaVersion) || input.unit !== 'px') fail()
  if (JSON.stringify(input).length > STUDIO_LIMITS.bytes) fail()
  const page = input.page
  if (!page || !Number.isInteger(page.width) || !Number.isInteger(page.height) ||
    !finite(page.width, 32, STUDIO_LIMITS.side) || !finite(page.height, 32, STUDIO_LIMITS.side) || !isColor(page.background)) fail()
  if (!Array.isArray(input.objects) || input.objects.length > STUDIO_LIMITS.objects) fail()
  const ids = new Set()
  const objects = input.objects.map((object) => {
    if (!object || !TYPES.has(object.type) || typeof object.id !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(object.id) || ids.has(object.id)) fail()
    ids.add(object.id)
    for (const key of ['x', 'y']) if (!finite(object[key], -16384, 16384)) fail()
    for (const key of ['width', 'height']) if (!finite(object[key], 1, 16384)) fail()
    if (!finite(object.rotation, -360, 360) || !isColor(object.fill)) fail()
    const clean = Object.fromEntries(['id', 'type', 'x', 'y', 'width', 'height', 'rotation', 'fill'].map(key => [key, object[key]]))
    for (const key of ['locked', 'hidden']) {
      if (object[key] !== undefined && typeof object[key] !== 'boolean') fail()
      clean[key] = input.schemaVersion === 1 ? false : (object[key] ?? false)
    }
    if (object.type === 'text') {
      if (typeof object.text !== 'string' || object.text.length > 10000 || !finite(object.fontSize, 8, 500)) fail()
      const scaleX = object.scaleX ?? 1, scaleY = object.scaleY ?? 1
      if (!finite(scaleX, 0.02, 8) || !finite(scaleY, 0.02, 8)) fail()
      const fontFamily = input.schemaVersion < 3 ? 'sans-serif' : (object.fontFamily ?? 'sans-serif')
      if (!validStudioFont(fontFamily) || (object.fontVariant !== undefined && object.fontVariant !== 'regular')) fail()
      Object.assign(clean, { text: object.text, fontSize: object.fontSize, fontFamily, fontVariant: 'regular', scaleX, scaleY })
    }
    if (object.type === 'image') {
      if (typeof object.fileAssetId !== 'string' || !FILE_ID.test(object.fileAssetId)) fail()
      clean.fileAssetId = object.fileAssetId.toLowerCase()
    }
    if (object.type === 'vector') {
      if (input.schemaVersion < 3 || !iconSource(object.iconId)) fail()
      try { clean.geometry = validateGeometry(object.geometry) } catch { fail() }
      clean.iconId = object.iconId
    }
    return clean
  })
  // Explicit allowlist: viewport, signed URLs and Fabric internals never persist.
  return { schemaVersion: STUDIO_SCHEMA_VERSION, unit: 'px', page: { width: page.width, height: page.height, background: page.background }, objects }
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
