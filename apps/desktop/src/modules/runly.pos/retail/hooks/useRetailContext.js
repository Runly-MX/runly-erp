// apps/desktop/src/modules/runly.pos/retail/hooks/useRetailContext.js
import { useCallback, useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { runly } from '../../../../lib/runly.js'
import { selectionKey } from '../lib/retailRules.js'

function readSelection(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) ?? 'null')
    return value && typeof value === 'object' ? { outletId: value.outletId ?? null, terminalId: value.terminalId ?? null } : { outletId: null, terminalId: null }
  } catch {
    return { outletId: null, terminalId: null }
  }
}

function writeSelection(key, value) {
  try {
    if (value.outletId) localStorage.setItem(key, JSON.stringify(value))
    else localStorage.removeItem(key)
  } catch { /* private mode: selection lasts for this tab only */ }
}

// C0 context for the selected outlet/terminal. The selection is an explicit
// choice saved per user + company; C0 validates it on every load and a 404
// clears it (never falls back to the first outlet or terminal).
export function useRetailContext({ token, companyId, userId }) {
  const queryClient = useQueryClient()
  const storageKey = selectionKey(userId, companyId)
  const [selection, setSelection] = useState(() => readSelection(storageKey))
  const [notice, setNotice] = useState(null)

  useEffect(() => { setSelection(readSelection(storageKey)) }, [storageKey])

  const query = useQuery({
    queryKey: ['pos-retail-context', companyId, selection.outletId, selection.terminalId, token],
    queryFn: () => runly.commerce.context({
      ...(selection.outletId ? { outletId: selection.outletId } : {}),
      ...(selection.outletId && selection.terminalId ? { terminalId: selection.terminalId } : {}),
    }, token),
    enabled: Boolean(token && companyId),
    staleTime: 15_000,
    retry: (count, error) => ![401, 403, 404].includes(error?.status) && count < 2,
  })

  useEffect(() => {
    if (query.error?.status !== 404) return
    setNotice('La caja guardada ya no está disponible. Elige otra.')
    const cleared = { outletId: null, terminalId: null }
    writeSelection(storageKey, cleared)
    setSelection(cleared)
  }, [query.error, storageKey])

  const choose = useCallback((next) => {
    setNotice(null)
    writeSelection(storageKey, next)
    setSelection(next)
  }, [storageKey])

  return {
    context: query.data?.data ?? null,
    isPending: query.isPending,
    error: query.error?.status === 404 ? null : query.error,
    refetch: query.refetch,
    selection,
    notice,
    chooseOutlet: (outletId) => choose({ outletId, terminalId: null }),
    chooseTerminal: (terminalId) => choose({ outletId: selection.outletId, terminalId }),
    changeCaja: () => choose({ outletId: null, terminalId: null }),
    invalidate: () => queryClient.invalidateQueries({ queryKey: ['pos-retail-context', companyId] }),
  }
}
