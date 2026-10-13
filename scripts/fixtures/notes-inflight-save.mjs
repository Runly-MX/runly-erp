import { createElement, useEffect, useRef } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import * as Y from 'yjs'
import { useCommitRefValue } from '../../apps/desktop/src/modules/runly.notes/hooks/useCommitRefValue.js'
import { useNoteSaveOnUnmount } from '../../apps/desktop/src/modules/runly.notes/hooks/useNoteSaveOnUnmount.js'
import { flushNoteSave } from '../../apps/desktop/src/modules/runly.notes/lib/flushNoteSave.js'
import { base64ToBytes } from '../../apps/desktop/src/modules/runly.notes/lib/SupabaseYjsProvider.js'

window.runNotesInflightSave = async () => {
  const mount = document.createElement('div')
  document.body.append(mount)
  const root = createRoot(mount), doc = new Y.Doc(), server = new Y.Doc()
  const state = Object.fromEntries(['pendingRef', 'capturedYDocRef', 'flushRef'].map(key => [key, { current: null }]))
  for (const key of ['ydocDirtyRef', 'savingRef', 'rerunRef']) state[key] = { current: false }
  const calls = [], lifecycle = [], failures = []
  let resolveFirst, resolveDrained, timerFired = false, readsAfterDestroy = 0, unmounted = false
  const first = new Promise(resolve => { resolveFirst = resolve })
  const drained = new Promise(resolve => { resolveDrained = resolve })
  const store = doc.store
  Object.defineProperty(doc, 'store', { get() { if (doc.isDestroyed) readsAfterDestroy++; return store } })
  const notes = {
    async saveYDoc(id, update) {
      calls.push(['y', id])
      if (calls.length === 1) await first
      Y.applyUpdate(server, base64ToBytes(update))
      return {}
    },
    async update(id, snap) { calls.push(['html', id, snap.title]); resolveDrained() },
  }
  const flush = () => flushNoteSave({ readOnly: false, noteId: 'note-a', token: 'fixture-token',
    ydoc: doc, provider: { serverStateVector: null }, notes, queryClient: { invalidateQueries() {} }, state,
    logger: { error: (...args) => failures.push(args), warn: (...args) => failures.push(args) } })

  function Surface() {
    const timer = useRef(null)
    useCommitRefValue(state.flushRef, flush)
    useNoteSaveOnUnmount(state.flushRef, timer)
    useEffect(() => { timer.current = setTimeout(() => { timerFired = true }, 1000) }, [])
    return createElement('div', null, 'fixture')
  }
  function EngineOwner() {
    useEffect(() => () => {
      lifecycle.push(state.capturedYDocRef.current ? 'captured-before-destroy' : 'missing-before-destroy')
      doc.destroy()
    }, [])
    return createElement(Surface)
  }
  try {
    flushSync(() => root.render(createElement(EngineOwner)))
    doc.getText('text').insert(0, 'first')
    state.ydocDirtyRef.current = true
    const saving = flush()
    doc.getText('text').insert(5, ' second')
    state.ydocDirtyRef.current = true
    state.pendingRef.current = { title: 'second', content: '<p>second</p>', contentText: 'second' }
    flushSync(() => root.unmount())
    unmounted = true
    resolveFirst()
    await saving
    await Promise.race([drained, new Promise((_, reject) => setTimeout(() => reject(new Error('Drain timeout')), 2000))])
    await new Promise(resolve => setTimeout(resolve, 1050))
    // Read the live simulated server, never the destroyed client.
    return { lifecycle, calls, text: server.getText('text').toString(), readsAfterDestroy, timerFired, failures }
  } finally {
    if (!unmounted) flushSync(() => root.unmount())
    if (!doc.isDestroyed) doc.destroy()
    server.destroy()
    mount.remove()
  }
}
