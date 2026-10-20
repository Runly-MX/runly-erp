import { createContext, createElement, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { guestApi } from '../lib/guest-api.js'
import { createSessionStore, isSessionExpired, msUntilRefresh } from '../lib/guest-session.js'

const GuestContext = createContext(null)

function browserStore() {
  try { return typeof sessionStorage === 'undefined' ? null : sessionStorage } catch { return null }
}

// Owns the portal session for one link token.
// status: loading | needs-code | ready | error. The session lives in sessionStorage
// (memory fallback) so a refresh keeps working, and is refreshed before it expires.
export function GuestSessionProvider({ token, children }) {
  const qc = useQueryClient()
  const store = useMemo(() => createSessionStore(browserStore()), [])
  const [state, setState] = useState({ status: 'loading', session: null, error: null })
  const [busy, setBusy] = useState(false)
  const sessionRef = useRef(null)

  const fail = useCallback((error) => {
    store.clear(token)
    sessionRef.current = null
    qc.removeQueries({ queryKey: ['inventory-guest'] })
    setState({ status: 'error', session: null, error })
  }, [qc, store, token])

  const open = useCallback(async (code) => {
    setBusy(true)
    try {
      const session = await guestApi.startSession(token, code)
      store.write(token, session)
      sessionRef.current = session
      setState({ status: 'ready', session, error: null })
    } catch (error) {
      if (error.code === 'CODE_REQUIRED') setState({ status: 'needs-code', session: null, error: null })
      else if (error.code === 'INVALID_CODE') setState({ status: 'needs-code', session: null, error })
      else fail(error)
    } finally { setBusy(false) }
  }, [fail, store, token])

  useEffect(() => {
    const saved = store.read(token)
    if (saved && !isSessionExpired(saved)) {
      sessionRef.current = saved
      setState({ status: 'ready', session: saved, error: null })
    } else {
      open()
    }
  }, [token]) // eslint-disable-line react-hooks/exhaustive-deps

  const session = state.session
  useEffect(() => {
    if (state.status !== 'ready' || !session) return undefined
    const timer = setTimeout(async () => {
      try {
        const { expiresAt } = await guestApi.refresh(session.sessionToken)
        const next = { ...session, expiresAt }
        store.write(token, next)
        sessionRef.current = next
        setState((s) => ({ ...s, session: next }))
      } catch (error) { fail(error) }
    }, msUntilRefresh(session))
    return () => clearTimeout(timer)
  }, [state.status, session, store, token, fail])

  const logout = useCallback(async () => {
    const current = sessionRef.current
    try { if (current) await guestApi.logout(current.sessionToken) } catch { /* session already gone */ }
    fail({ code: 'LOGGED_OUT' })
  }, [fail])

  const value = useMemo(() => ({ ...state, busy, submitCode: open, logout, expire: fail }), [state, busy, open, logout, fail])
  return createElement(GuestContext.Provider, { value }, children)
}

export function useGuestSession() {
  const ctx = useContext(GuestContext)
  if (!ctx) throw new Error('useGuestSession must be used inside GuestSessionProvider')
  return ctx
}

// Runs a guest API call; a SESSION_INVALID answer ends the session (full-page message).
function useGuestCall() {
  const { session, expire } = useGuestSession()
  const sessionToken = session?.sessionToken
  return useMemo(() => ({
    sessionToken,
    run: async (fn) => {
      try { return await fn(sessionToken) } catch (error) {
        if (error.code === 'SESSION_INVALID') expire(error)
        throw error
      }
    },
  }), [sessionToken, expire])
}

const keyFor = (...parts) => ['inventory-guest', ...parts]

function useGuestQuery(key, fn, options = {}) {
  const { sessionToken, run } = useGuestCall()
  const { enabled = true, ...rest } = options
  return useQuery({
    queryKey: keyFor(sessionToken, ...key),
    queryFn: () => run(fn),
    enabled: Boolean(sessionToken) && enabled,
    retry: false,
    refetchOnWindowFocus: false,
    ...rest,
  })
}

export const useGuestMe = () => useGuestQuery(['me'], (s) => guestApi.me(s), { staleTime: 60_000 })
export const useGuestCatalogs = () => useGuestQuery(['catalogs'], (s) => guestApi.catalogs(s), { staleTime: 5 * 60_000 })
export const useGuestItems = (query) => useGuestQuery(['items', query], (s) => guestApi.listItems(s, query), { placeholderData: keepPreviousData })
export const useGuestItem = (itemId) => useGuestQuery(['item', itemId], (s) => guestApi.getItem(s, itemId), { enabled: Boolean(itemId) })
export const useGuestItemHistory = (itemId) => useGuestQuery(['history', itemId], (s) => guestApi.history(s, itemId), { enabled: Boolean(itemId) })
export const useGuestItemFiles = (itemId) => useGuestQuery(['files', itemId], (s) => guestApi.listFiles(s, itemId), { enabled: Boolean(itemId) })

function useGuestMutation(fn, invalidate = [['items']]) {
  const qc = useQueryClient()
  const { sessionToken, run } = useGuestCall()
  return useMutation({
    mutationFn: (vars) => run((s) => fn(s, vars)),
    onSuccess: () => { for (const key of invalidate) qc.invalidateQueries({ queryKey: keyFor(sessionToken, ...key) }) },
  })
}

export const useCreateGuestItem = () => useGuestMutation((s, body) => guestApi.createItem(s, body))
export const useUpdateGuestItem = () => useGuestMutation((s, { id, ...body }) => guestApi.updateItem(s, id, body), [['items'], ['item'], ['history']])
export const useUploadGuestFile = () => useGuestMutation((s, { itemId, file, label }) => guestApi.uploadFile(s, itemId, file, label), [['files'], ['history'], ['items']])
export const useDeleteGuestFile = () => useGuestMutation((s, { itemId, docId }) => guestApi.deleteFile(s, itemId, docId), [['files'], ['history'], ['items']])
