import { useEffect, useState } from 'react'
import { intakeRequest } from '../lib/intake.js'

const norm = (value) => String(value ?? '').trim().toLocaleLowerCase('es')

export const IDENTIFIER_CONFLICT_MESSAGES = {
  serialNumber: 'Ya existe un inventario activo con este número de serie',
  assetTag: 'Ya existe un inventario activo con este número de activo',
}

// Debounced lookup of active items already using the typed serial / asset number.
// `original` holds the values the edited item already has (never a conflict).
// Returns { serialNumber: item|null, assetTag: item|null }.
export function useIdentifierConflicts({ apiBaseUrl, token, companyId, serialNumber, assetTag, excludeId = null, original = null, enabled = true, delay = 400 }) {
  const [conflicts, setConflicts] = useState({ serialNumber: null, assetTag: null })
  const serial = String(serialNumber ?? '').trim()
  const tag = String(assetTag ?? '').trim()
  const originalSerial = original?.serialNumber
  const originalTag = original?.assetTag

  useEffect(() => {
    const checkSerial = enabled && serial && norm(serial) !== norm(originalSerial)
    const checkTag = enabled && tag && norm(tag) !== norm(originalTag)
    if (!token || !companyId || (!checkSerial && !checkTag)) {
      setConflicts((prev) => (prev.serialNumber || prev.assetTag ? { serialNumber: null, assetTag: null } : prev))
      return undefined
    }
    const controller = new AbortController()
    const timer = setTimeout(async () => {
      const params = new URLSearchParams()
      if (checkSerial) params.set('serialNumber', serial)
      if (checkTag) params.set('assetTag', tag)
      if (excludeId) params.set('excludeId', excludeId)
      try {
        const data = await intakeRequest({ apiBaseUrl, token, companyId, path: `/inventory/items/check-identifiers?${params}`, signal: controller.signal })
        setConflicts({ serialNumber: checkSerial ? (data?.serialNumber ?? null) : null, assetTag: checkTag ? (data?.assetTag ?? null) : null })
      } catch {
        // Offline or aborted: the server still enforces uniqueness on save.
      }
    }, delay)
    return () => { clearTimeout(timer); controller.abort() }
  }, [apiBaseUrl, token, companyId, serial, tag, excludeId, originalSerial, originalTag, enabled, delay])

  return conflicts
}
