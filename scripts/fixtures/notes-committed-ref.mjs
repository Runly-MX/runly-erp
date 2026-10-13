import { createElement, useEffect, useLayoutEffect, useRef, Suspense, StrictMode, startTransition } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import { useCommitRefValue } from '../../apps/desktop/src/modules/runly.notes/hooks/useCommitRefValue.js'

window.runNotesCommittedRef = async (scenario) => {
  const mount = document.createElement('div')
  document.body.append(mount)
  const root = createRoot(mount)
  const calls = []
  const rendered = []
  const refs = new Map()
  const blocked = new Promise(() => {})
  let timerFired = false
  let unmounted = false

  function Surface({ id, label, suspend = false }) {
    const callback = () => calls.push({ id, label })
    const ref = useRef(null)
    useCommitRefValue(ref, callback)
    const timer = useRef(null)
    useLayoutEffect(() => { refs.set(id, ref) }, [id, ref])
    // Same lifecycle as NoteEditorSurface: cancel debounce and invoke the
    // shared ref on unmount, without flushing on every callback change.
    useEffect(() => {
      timer.current = setTimeout(() => { timerFired = true }, 1000)
      return () => {
        clearTimeout(timer.current)
        ref.current()
      }
    }, [ref])
    rendered.push(label)
    if (suspend) throw blocked
    return createElement('div', { 'data-note': id }, label)
  }

  const render = (id, label, suspend = false) => {
    const tree = createElement(Suspense, { fallback: createElement('span', null, 'loading') },
      createElement(Surface, { key: id, id, label, suspend }))
    root.render(scenario === 'strict' ? createElement(StrictMode, null, tree) : tree)
  }
  const tick = () => new Promise(resolve => setTimeout(resolve, 0))
  try {
    flushSync(() => render('note-a', 'committed-a'))
    await tick()
    calls.length = 0 // Ignore StrictMode's initial development replay.

    if (scenario === 'suspended' || scenario === 'strict') {
      startTransition(() => render('note-a', 'discarded', true))
      const deadline = performance.now() + 2000
      while (!rendered.includes('discarded') && performance.now() < deadline) await tick()
      if (!rendered.includes('discarded')) throw new Error('Suspended render was not observed')
      if (mount.textContent !== 'committed-a') throw new Error('Committed UI was replaced')
    } else if (scenario === 'committed' || scenario === 'async') {
      flushSync(() => render('note-a', 'committed-b'))
      if (calls.length) throw new Error('Callback change triggered a flush')
      if (scenario === 'async') {
        await new Promise(resolve => queueMicrotask(() => { refs.get('note-a').current(); resolve() }))
      }
    } else if (scenario === 'keys') {
      flushSync(() => render('note-b', 'committed-b'))
      await tick()
    }

    flushSync(() => root.unmount())
    unmounted = true
    // Confirm clearTimeout actually prevents the scheduled callback.
    await new Promise(resolve => setTimeout(resolve, 1050))
    return { calls, timerFired, suspendedRenderObserved: rendered.includes('discarded') }
  } finally {
    if (!unmounted) flushSync(() => root.unmount())
    mount.remove()
  }
}
