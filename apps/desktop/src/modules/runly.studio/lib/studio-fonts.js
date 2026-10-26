import { STUDIO_FONTS } from '../../../../../shared/studio/fonts.js'
const loaded = new Map()
export function ensureStudioFont(family) {
  const entry = STUDIO_FONTS.find(font => font.family === family)
  if (!entry) return Promise.reject(new Error('Fuente no admitida.'))
  if (!entry.file) return Promise.resolve()
  if (loaded.has(family)) return loaded.get(family)
  const promise = (async () => {
    const face = new FontFace(family, `url("${import.meta.env.BASE_URL}studio-fonts/${entry.file}")`, { style: 'normal', weight: '400' })
    let timer
    try {
      await Promise.race([face.load(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('La fuente tardó demasiado en cargar.')),8000) })])
      document.fonts.add(face)
      if (face.status !== 'loaded') throw Error('font unavailable')
    } catch { throw new Error(`No se pudo cargar ${family}. Reintenta; el diseño se conserva sin sustituir la fuente.`) }
    finally { clearTimeout(timer) }
  })()
  loaded.set(family,promise)
  promise.catch(() => { if (loaded.get(family) === promise) loaded.delete(family) })
  return promise
}
