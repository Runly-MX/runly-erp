import { createContext, useContext, useSyncExternalStore } from 'react'

// Recently used / picked colors, shared by every color control in Studio and
// kept per browser (a convenience, not document data).
const KEY = 'runly.studio.recent-colors', LIMIT = 12, listeners = new Set()
const HEX = /^#[0-9a-f]{6}$/i
let recent = (() => { try { const value = JSON.parse(localStorage.getItem(KEY) ?? '[]'); return Array.isArray(value) ? value.filter(color => HEX.test(color)).slice(0, LIMIT) : [] } catch { return [] } })()

export function rememberColor(color) {
  if (!HEX.test(color ?? '')) return
  const next = [color.toLowerCase(), ...recent.filter(item => item !== color.toLowerCase())].slice(0, LIMIT)
  if (next.join() === recent.join()) return
  recent = next
  try { localStorage.setItem(KEY, JSON.stringify(recent)) } catch { /* private mode */ }
  for (const listener of listeners) listener()
}

export function useRecentColors() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => listeners.delete(listener) }, () => recent, () => recent)
}

// EyeDropper may return rgb()/rgba() in some engines.
export function toHex(color) {
  if (!color) return null
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)/i.exec(color)
  const hex = match ? `#${match.slice(1, 4).map(value => Number(value).toString(16).padStart(2, '0')).join('')}` : String(color).toLowerCase()
  return HEX.test(hex) ? hex : null
}

// Eyedropper. Native EyeDropper picks from anywhere on screen; otherwise the
// workspace provides `pickFromCanvas` (tap the design to sample a pixel).
export const EyedropperContext = createContext({ pickFromCanvas: null })
export const nativeEyedropper = () => typeof window !== 'undefined' && 'EyeDropper' in window

export function useEyedropper() {
  const { pickFromCanvas } = useContext(EyedropperContext)
  const available = nativeEyedropper() || Boolean(pickFromCanvas)
  async function pick() {
    let color = null
    if (nativeEyedropper()) {
      try { color = (await new window.EyeDropper().open()).sRGBHex } catch { return null }
    } else if (pickFromCanvas) color = await pickFromCanvas()
    const hex = toHex(color)
    if (hex) rememberColor(hex)
    return hex
  }
  return { available, pick }
}
