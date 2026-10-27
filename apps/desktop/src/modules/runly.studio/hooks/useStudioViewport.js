import { useEffect, useRef, useState, useCallback } from 'react'

export function useStudioViewport(page, editorRef) {
  const viewport = useRef(null), paper = useRef(null), drag = useRef(null), space = useRef(false), fitMode = useRef(false)
  const [zoom, setZoom] = useState(0.5), [hand, setHand] = useState(false), [size, setSize] = useState({ width: 0, height: 0 })
  const zoomRef = useRef(zoom), handRef = useRef(hand)
  useEffect(() => { handRef.current = hand }, [hand])
  const center = useCallback(() => {
    const node = viewport.current
    if (node) { node.scrollLeft = (node.scrollWidth - node.clientWidth) / 2; node.scrollTop = (node.scrollHeight - node.clientHeight) / 2 }
  }, [])
  const changeZoom = useCallback((value, point) => {
    const node = viewport.current, sheet = paper.current
    if (!node || !sheet) return
    const rect = sheet.getBoundingClientRect(), view = node.getBoundingClientRect()
    const anchor = point ?? { x: view.left + node.clientWidth / 2, y: view.top + node.clientHeight / 2 }
    const x = (anchor.x - rect.left) / zoomRef.current, y = (anchor.y - rect.top) / zoomRef.current
    const next = Math.max(0.05, Math.min(4, value))
    zoomRef.current = next; setZoom(next)
    requestAnimationFrame(() => {
      if (!paper.current || !viewport.current) return
      const current = paper.current.getBoundingClientRect()
      viewport.current.scrollLeft += current.left + x * next - anchor.x
      viewport.current.scrollTop += current.top + y * next - anchor.y
    })
  }, [])
  const fit = useCallback(() => {
    const node = viewport.current
    if (!node) return
    fitMode.current = true
    const next = Math.max(0.05, Math.min(4, (node.clientWidth - 96) / page.width, (node.clientHeight - 96) / page.height))
    zoomRef.current = next; setZoom(next); requestAnimationFrame(center)
  }, [page.width, page.height, center])
  useEffect(() => {
    const node = viewport.current
    const observer = new ResizeObserver(() => { setSize({ width: node.clientWidth, height: node.clientHeight }); if (fitMode.current) fit() })
    observer.observe(node)
    const wheel = event => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault(); fitMode.current = false
      changeZoom(zoomRef.current * Math.exp(-event.deltaY * 0.002), { x: event.clientX, y: event.clientY })
    }
    node.addEventListener('wheel', wheel, { passive: false })
    return () => { observer.disconnect(); node.removeEventListener('wheel', wheel) }
  }, [fit, changeZoom])
  // Touch: two fingers pan and pinch-zoom anywhere (anchored at their
  // midpoint); one finger on the empty area around the page (or anywhere with
  // the hand tool) pans. One finger
  // on the page stays with Fabric (select, move). The viewport owns all touch
  // gestures (touch-action: none), so the browser never zooms the whole app.
  useEffect(() => {
    const node = viewport.current
    let gesture = null, pan = null, owned = false, first = null, frame = 0, pending = null
    const midpoint = list => { const [a, b] = list; return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2, distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) } }
    const apply = () => {
      frame = 0
      if (!pending || !paper.current) return
      const { zoom: next, anchor, doc } = pending
      if (next !== zoomRef.current) { zoomRef.current = next; setZoom(next) }
      // Keep the document point that started under the fingers under their current midpoint.
      requestAnimationFrame(() => {
        if (!paper.current) return
        const rect = paper.current.getBoundingClientRect()
        node.scrollLeft += rect.left + doc.x * next - anchor.x
        node.scrollTop += rect.top + doc.y * next - anchor.y
      })
    }
    const schedule = value => { pending = value; if (!frame) frame = requestAnimationFrame(apply) }
    // Fabric already started a one-finger interaction: bring that finger back to
    // where it began and end it there, so the gesture never moves an object.
    function releaseFabric() {
      if (!first || !paper.current?.contains(first.target)) return
      const init = { bubbles: true, cancelable: true, changedTouches: [first.touch] }
      first.target.dispatchEvent(new TouchEvent('touchmove', { ...init, touches: [first.touch], targetTouches: [first.touch] }))
      first.target.dispatchEvent(new TouchEvent('touchend', { ...init, touches: [], targetTouches: [] }))
    }
    const own = event => { event.preventDefault(); event.stopPropagation() }
    // The touch's pointerdown already reached the context menu trigger, which
    // starts a long-press timer; cancel it, since its pointerup is now ours.
    const cancelLongPress = (target, touch) => target?.dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerType: 'touch', isPrimary: true, clientX: touch.clientX, clientY: touch.clientY }))
    function start(event) {
      if (!event.isTrusted) return
      const list = event.touches
      if (list.length === 1) {
        first = { touch: list[0], target: event.target }
        owned = handRef.current || !paper.current?.contains(event.target)
        if (owned) { pan = { x: list[0].clientX, y: list[0].clientY, left: node.scrollLeft, top: node.scrollTop }; cancelLongPress(event.target, list[0]); own(event) }
        return
      }
      if (!gesture && list.length >= 2) {
        if (!owned) releaseFabric()
        cancelLongPress(first?.target, list[0]); cancelLongPress(event.target, list[list.length - 1])
        const mid = midpoint(list), rect = paper.current.getBoundingClientRect()
        gesture = { distance: Math.max(mid.distance, 1), zoom: zoomRef.current, doc: { x: (mid.x - rect.left) / zoomRef.current, y: (mid.y - rect.top) / zoomRef.current } }
        fitMode.current = false; pan = null; owned = true
      }
      if (owned) own(event)
    }
    function move(event) {
      if (!event.isTrusted || !owned) return
      own(event)
      if (gesture && event.touches.length >= 2) {
        const mid = midpoint(event.touches)
        schedule({ zoom: Math.max(0.05, Math.min(4, gesture.zoom * mid.distance / gesture.distance)), anchor: mid, doc: gesture.doc })
      } else if (pan) {
        node.scrollLeft = pan.left - event.touches[0].clientX + pan.x; node.scrollTop = pan.top - event.touches[0].clientY + pan.y
      }
    }
    function end(event) {
      if (!event.isTrusted || !owned) return
      own(event)
      if (event.touches.length < 2) gesture = null
      if (!event.touches.length) { owned = false; pan = null; first = null }
    }
    // Pointer events of owned touches must not reach Fabric or the hand tool either.
    const pointer = event => { if (event.isTrusted && event.pointerType === 'touch' && owned) event.stopPropagation() }
    // iOS Safari pinch events would zoom the page itself.
    const block = event => event.preventDefault()
    const options = { capture: true, passive: false }
    const listeners = [['touchstart', start], ['touchmove', move], ['touchend', end], ['touchcancel', end],
      ['pointermove', pointer], ['pointerup', pointer], ['pointercancel', pointer], ['gesturestart', block], ['gesturechange', block]]
    for (const [type, listener] of listeners) node.addEventListener(type, listener, options)
    return () => { cancelAnimationFrame(frame); for (const [type, listener] of listeners) node.removeEventListener(type, listener, options) }
  }, [])
  useEffect(() => {
    function keydown(event) {
      if (event.code !== 'Space' || event.target.closest('input,textarea,[contenteditable=true]') || editorRef.current?.isEditingText()) return
      if (!viewport.current?.closest('[role=application]')?.contains(document.activeElement)) return
      event.preventDefault(); space.current = true; editorRef.current?.setPanMode(true)
    }
    function reset() { space.current = false; drag.current = null; editorRef.current?.setPanMode(hand) }
    function keyup(event) { if (event.code === 'Space') reset() }
    window.addEventListener('keydown', keydown); window.addEventListener('keyup', keyup); window.addEventListener('blur', reset)
    editorRef.current?.setPanMode(hand)
    return () => { window.removeEventListener('keydown', keydown); window.removeEventListener('keyup', keyup); window.removeEventListener('blur', reset); editorRef.current?.setPanMode(false) }
  }, [hand, editorRef])
  const [panning, setPanning] = useState(false)
  // Pan with the hand tool, Space + drag, or holding the middle mouse button
  // (wheel click) in any tool, as in other design editors.
  function down(event) {
    if (event.pointerType === 'touch') return // touch panning lives in the gesture effect
    const middle = event.button === 1
    if (!middle && (!(hand || space.current) || event.button !== 0)) return
    event.preventDefault(); event.stopPropagation()
    drag.current = { x: event.clientX, y: event.clientY, left: viewport.current.scrollLeft, top: viewport.current.scrollTop }
    viewport.current.setPointerCapture(event.pointerId); setPanning(true)
  }
  const stop = () => { drag.current = null; setPanning(false) }
  function move(event) {
    if (!drag.current) return
    event.preventDefault(); event.stopPropagation()
    viewport.current.scrollLeft = drag.current.left - event.clientX + drag.current.x
    viewport.current.scrollTop = drag.current.top - event.clientY + drag.current.y
  }
  const restore = useCallback(saved => {
    if (!saved) return
    fitMode.current = false
    zoomRef.current = saved.zoom; setZoom(saved.zoom)
    requestAnimationFrame(() => {
      if (!viewport.current) return
      viewport.current.scrollLeft = saved.scrollLeft ?? 0
      viewport.current.scrollTop = saved.scrollTop ?? 0
    })
  }, [])
  return { viewport, paper, zoom, hand, setHand, center, fit, restore, size, panning,
    changeZoom: value => { fitMode.current = false; changeZoom(value) },
    // onAuxClick/onMouseDown keep the browser's middle-click autoscroll and link-open away.
    gestures: { onPointerDownCapture: down, onPointerMoveCapture: move, onPointerUpCapture: stop, onPointerCancel: stop,
      onMouseDownCapture: event => { if (event.button === 1) event.preventDefault() }, onAuxClick: event => event.preventDefault() } }
}
