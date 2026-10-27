import { useCallback, useEffect, useRef, useState } from 'react'
import { moveId } from '../../../lib/studio-pages.js'

function scroller(node) {
  for (let parent = node?.parentElement; parent; parent = parent.parentElement) {
    if (/auto|scroll/.test(getComputedStyle(parent).overflowY)) return parent
  }
  return null
}

// Pointer-based reorder (mouse, pen and touch share it) from a drag handle, plus
// arrow keys on the handle for keyboard users. `onReorder(ids)` gets the new order.
export function usePageDrag({ ids, containerRef, onReorder, announce }) {
  const [drag, setDrag] = useState(null)
  const state = useRef(null), idsRef = useRef(ids)
  idsRef.current = ids

  const stop = useCallback(() => { state.current = null; setDrag(null) }, [])
  const start = useCallback((event, id) => {
    if (event.button !== undefined && event.button !== 0) return
    event.preventDefault()
    state.current = { id, pointerId: event.pointerId, over: idsRef.current.indexOf(id), y: event.clientY }
    setDrag({ id, over: state.current.over })
  }, [])

  useEffect(() => {
    if (!drag) return undefined
    let frame = 0
    const scroll = () => {
      frame = 0
      const current = state.current, box = scroller(containerRef.current)
      if (!current || !box) return
      const rect = box.getBoundingClientRect(), edge = 36
      const delta = current.y < rect.top + edge ? -14 : current.y > rect.bottom - edge ? 14 : 0
      if (delta) { box.scrollTop += delta; frame = requestAnimationFrame(scroll) }
    }
    const move = event => {
      const current = state.current
      if (!current || event.pointerId !== current.pointerId) return
      current.y = event.clientY
      const card = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-page-id]')
      if (card) {
        const over = idsRef.current.indexOf(card.getAttribute('data-page-id'))
        if (over >= 0 && over !== current.over) { current.over = over; setDrag({ id: current.id, over }) }
      }
      if (!frame) frame = requestAnimationFrame(scroll)
    }
    const end = event => {
      const current = state.current
      if (!current || event.pointerId !== current.pointerId) return
      const order = idsRef.current, from = order.indexOf(current.id)
      stop()
      if (event.type === 'pointerup' && from !== current.over && current.over >= 0) {
        onReorder(moveId(order, current.id, current.over))
        announce?.(current.id, current.over)
      }
    }
    const cancelKey = event => { if (event.key === 'Escape') stop() }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', end)
    window.addEventListener('pointercancel', end)
    window.addEventListener('keydown', cancelKey)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', end)
      window.removeEventListener('pointercancel', end); window.removeEventListener('keydown', cancelKey)
    }
  }, [drag?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleKey = useCallback((event, id) => {
    const delta = { ArrowUp: -1, ArrowLeft: -1, ArrowDown: 1, ArrowRight: 1 }[event.key]
    if (!delta) return
    const order = idsRef.current, to = order.indexOf(id) + delta
    if (to < 0 || to >= order.length) return
    event.preventDefault(); event.stopPropagation()
    onReorder(moveId(order, id, to))
    announce?.(id, to)
  }, [onReorder, announce])

  return { drag, start, handleKey }
}
