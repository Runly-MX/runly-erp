// Supplier-portal data source for the shared inventory form pieces (see lib/inventory-data-context.js),
// plus the Excel-import client and the live duplicate-identifier check.
import { useEffect, useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { guestApi } from '../lib/guest-api.js'
import { capabilitiesFor } from '../lib/guest-capabilities.js'
import { assertInventoryAdapter } from '../lib/inventory-data-context.js'
import { saveBlob } from '../lib/save-blob.js'
import { useGuestCall, useGuestCatalogs, useGuestMe, useGuestMutation, useGuestQuery } from './useInventoryGuest.js'

const CATALOG_KEYS = [['catalogs'], ['models']]

export const useGuestModels = () => useGuestQuery(['models'], (s) => guestApi.models(s), { staleTime: 60_000 })
export const useGuestCreateModel = () => useGuestMutation((s, body) => guestApi.createModel(s, body), CATALOG_KEYS)
export const useGuestCreateEntry = (kind) => useGuestMutation((s, body) => guestApi.createEntry(s, kind, body), CATALOG_KEYS)

// Adapter consumed through <InventoryDataProvider value={guestInventoryData}>.
export const guestInventoryData = assertInventoryAdapter({
  useModelRows: () => useGuestModels().data ?? [],
  useSaveModel: useGuestCreateModel,
  useTypeRows: () => useGuestCatalogs().data?.categories ?? [],
  useBrandRows: () => useGuestCatalogs().data?.brands ?? [],
  useCreateType: () => useGuestCreateEntry('types'),
  useCreateBrand: () => useGuestCreateEntry('brands'),
  useCanCreate: (areaId) => capabilitiesFor(useGuestMe().data, areaId || null).canCreateModels,
})

// { call, downloadTemplate, afterImport } for ImportDialogView, bound to the guest session.
export function useGuestImportClient() {
  const { run } = useGuestCall()
  const qc = useQueryClient()
  return useMemo(() => ({
    call: (path, body) => run((s) => guestApi.importCall(s, path, body)),
    downloadTemplate: async () => saveBlob(await run((s) => guestApi.importTemplate(s)), 'plantilla-activos.xlsx'),
    afterImport: () => qc.invalidateQueries({ queryKey: ['inventory-guest'] }),
  }), [run, qc])
}

const norm = (v) => String(v ?? '').trim().toLocaleLowerCase('es')

// Debounced duplicate check. `original` holds the values the edited item already has (never a conflict).
export function useGuestIdentifierConflicts({ serialNumber, assetTag, excludeId = null, original = null, delay = 400 }) {
  const { run } = useGuestCall()
  const [conflicts, setConflicts] = useState({ serialNumber: null, assetTag: null })
  const serial = String(serialNumber ?? '').trim()
  const tag = String(assetTag ?? '').trim()
  const originalSerial = original?.serialNumber
  const originalTag = original?.assetTag

  useEffect(() => {
    const checkSerial = serial && norm(serial) !== norm(originalSerial)
    const checkTag = tag && norm(tag) !== norm(originalTag)
    if (!checkSerial && !checkTag) {
      setConflicts((prev) => (prev.serialNumber || prev.assetTag ? { serialNumber: null, assetTag: null } : prev))
      return undefined
    }
    let live = true
    const timer = setTimeout(async () => {
      try {
        const data = await run((s) => guestApi.checkIdentifiers(s, {
          ...(checkSerial ? { serialNumber: serial } : {}), ...(checkTag ? { assetTag: tag } : {}), ...(excludeId ? { excludeId } : {}),
        }))
        if (live) setConflicts({ serialNumber: checkSerial ? (data?.serialNumber ?? null) : null, assetTag: checkTag ? (data?.assetTag ?? null) : null })
      } catch { /* the server still enforces uniqueness on save */ }
    }, delay)
    return () => { live = false; clearTimeout(timer) }
  }, [run, serial, tag, excludeId, originalSerial, originalTag, delay])

  return conflicts
}
