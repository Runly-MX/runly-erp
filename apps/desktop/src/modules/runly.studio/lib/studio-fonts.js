import { studioFontStyle } from '../../../../../shared/studio/fonts.js'
const loaded = new Map()
export function ensureStudioFont(family,variant='regular') {
  const entry = studioFontStyle(family,variant)
  if (!entry) return Promise.reject(new Error('Fuente no admitida.'))
  if (!entry.file) return Promise.resolve()
  const key=`${family}:${variant}`
  if (loaded.has(key)) return loaded.get(key)
  const promise = (async () => {
    const face = new FontFace(family, `url("${import.meta.env.BASE_URL}studio-fonts/${entry.file}")`, { style: entry.style, weight: String(entry.weight) })
    let timer
    try {
      await Promise.race([face.load(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('La fuente tardó demasiado en cargar.')),8000) })])
      document.fonts.add(face)
      if (face.status !== 'loaded') throw Error('font unavailable')
    } catch { throw new Error(`No se pudo cargar ${family}. Reintenta; el diseño se conserva sin sustituir la fuente.`) }
    finally { clearTimeout(timer) }
  })()
  loaded.set(key,promise)
  promise.catch(() => { if (loaded.get(key) === promise) loaded.delete(key) })
  return promise
}
