import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { beep, haptic } from '../../runly.attendance/kiosk/lib/feedback.js'
import { useScanApi } from './useInventoryScan.js'
import { FEEDBACK, feedbackTone, itemFromSearchRow, searchRowCode } from '../lib/scan-kiosk.js'
import { findRowByCode, loadSession, normalizeScanCode, rowKeyFor, saveSession, sessionReducer } from '../lib/scan-session.js'

const BANNER_MS = 1600

function bannerFor(result) {
  const tone = feedbackTone(result.state)
  if (!tone) return null
  const item = result.item
  const detail = item ? [item.name, item.folio].filter(Boolean).join(' · ') : result.code
  const title = result.state === 'duplicate' ? 'Ya en la lista'
    : result.state === 'error' ? 'Sin conexión'
      : result.state === 'missing' ? 'No encontrado'
        : result.state === 'pending' ? 'Encontrado' : 'Agregado'
  return { tone, title, detail }
}

// Reads of the "Escanear" kiosk: the session list (sessionStorage per company),
// the last result, the highlighted row and the sensory feedback. Reads are
// processed one at a time so a burst keeps its order and duplicates are caught.
export function useScanKiosk({ companyId, autoAdd, muted }) {
  const api = useScanApi()
  const [rows, dispatch] = useReducer(sessionReducer, companyId, loadSession)
  const [last, setLast] = useState(null)
  const [highlightKey, setHighlightKey] = useState(null)
  const [banner, setBanner] = useState(null)
  const rowsRef = useRef(rows)
  const lastRef = useRef(last)
  const chain = useRef(Promise.resolve())
  const timer = useRef(null)
  const opts = useRef({ autoAdd, muted })
  rowsRef.current = rows
  lastRef.current = last
  opts.current = { autoAdd, muted }

  useEffect(() => { saveSession(companyId, rows) }, [companyId, rows])
  useEffect(() => () => clearTimeout(timer.current), [])

  const show = useCallback((result) => {
    setLast(result)
    const next = bannerFor(result)
    if (!next) return
    const cue = FEEDBACK[next.tone]
    haptic(cue.haptic)
    if (!opts.current.muted) beep(cue.sound)
    setBanner(next)
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setBanner(null), BANNER_MS)
  }, [])

  // result: { code, item, matchedBy }; force = explicit pick (always added).
  const apply = useCallback((result, readAt, { force = false } = {}) => {
    const key = rowKeyFor(result)
    const existing = rowsRef.current.find((r) => r.key === key)
    if (existing) {
      dispatch({ type: 'add', result, readAt })
      setHighlightKey(key)
      show({ ...result, item: result.item ?? existing.item, state: 'duplicate', added: true, reads: (existing.reads ?? 1) + 1 })
      return
    }
    const add = force || opts.current.autoAdd
    if (add) {
      dispatch({ type: 'add', result, readAt })
      setHighlightKey(key)
    }
    show({ ...result, readAt, state: result.item ? (add ? 'added' : 'pending') : 'missing', added: add })
  }, [show])

  const process = useCallback(async (text) => {
    const code = normalizeScanCode(text)
    if (!code) return
    const readAt = new Date().toISOString()
    const known = findRowByCode(rowsRef.current, code)
    if (known) {
      dispatch({ type: 'touch', key: known.key, readAt })
      setHighlightKey(known.key)
      show({ code, item: known.item, matchedBy: known.matchedBy, state: known.item ? 'duplicate' : 'missing', added: true, reads: (known.reads ?? 1) + 1 })
      return
    }
    setLast({ code, state: 'loading' })
    let found
    try {
      [found] = await api.resolve([code])
    } catch (err) {
      show({ code, state: 'error', message: err?.message ?? 'Revisa la conexión e inténtalo de nuevo.' })
      return
    }
    apply({ code, item: found?.item ?? null, matchedBy: found?.matchedBy ?? null }, readAt)
  }, [api, apply, show])

  const enqueue = useCallback((text) => {
    chain.current = chain.current.then(() => process(text)).catch(() => {})
  }, [process])

  // A suggestion picked in "Buscar o escribir código" (a GET /inventory/items row).
  const pick = useCallback((row) => {
    const item = itemFromSearchRow(row)
    if (!item) return
    chain.current = chain.current.then(() => apply({ code: searchRowCode(item), item, matchedBy: 'search' }, new Date().toISOString(), { force: true }))
  }, [apply])

  // "Agregar" on a pending result (auto-add off) or a not-found code.
  const addLast = useCallback(() => {
    const current = lastRef.current
    if (!current || current.added || current.state === 'loading' || current.state === 'error') return
    dispatch({ type: 'add', result: current, readAt: current.readAt })
    setHighlightKey(rowKeyFor(current))
    setLast({ ...current, state: current.item ? 'added' : 'missing', added: true })
  }, [])

  const reset = useCallback(() => { dispatch({ type: 'clear' }); setLast(null); setHighlightKey(null) }, [])

  return { rows, dispatch, last, setLast, highlightKey, banner, enqueue, pick, addLast, reset, api }
}
