import { useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'

function readStored(storageKey) {
  try { return window.localStorage.getItem(storageKey) } catch { return null }
}
function writeStored(storageKey, value) {
  try { window.localStorage.setItem(storageKey, value) } catch { /* storage unavailable */ }
}

// Selected tab: URL query `tab` is the source of truth; falls back to the last
// value stored in localStorage, then to `defaultValue`. Invalid values are ignored.
export function usePersistedTab(storageKey, validValues, defaultValue) {
  const [params, setParams] = useSearchParams()
  const fromUrl = params.get('tab')
  const stored = fromUrl ? null : readStored(storageKey)
  const candidate = fromUrl ?? stored
  const value = candidate && validValues.includes(candidate) ? candidate : defaultValue

  const setValue = useCallback((next) => {
    if (!validValues.includes(next)) return
    writeStored(storageKey, next)
    setParams((current) => {
      const copy = new URLSearchParams(current)
      copy.set('tab', next)
      return copy
    }, { replace: true })
  }, [storageKey, validValues, setParams])

  return [value, setValue]
}
