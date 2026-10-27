import { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react'
import { flushSync } from 'react-dom'

export function useStudioViewport(page, editorRef) {
  const viewport = useRef(null), paper = useRef(null), drag = useRef(null), space = useRef(false), fitMode = useRef(false)
  const [zoom, setZoom] = useState(0.5), [hand, setHand] = useState(false), [size, setSize] = useState({ width: 0, height: 0 })
  const zoomRef = useRef(zoom), handRef = useRef(hand)
  useEffect(() => { handRef.current = hand }, [hand])
  const frame = useRef(0), pending = useRef(null), desiredZoom = useRef(zoom)
  // Touch text editing: { saved, moved } while the on-screen keyboard is in play.
  const editing = useRef(null)
  const sync = useCallback(() => {
    const node = viewport.current, sheet = paper.current
    if (!node || !sheet) return
    const area = node.getBoundingClientRect(), rect = sheet.getBoundingClientRect()
    editorRef.current?.setViewport({ zoom: zoomRef.current, panX: rect.left - area.left, panY: rect.top - area.top, scrollLeft: node.scrollLeft, scrollTop: node.scrollTop })
    node.dispatchEvent(new Event('studio:viewport'))
  }, [editorRef])
  const center = useCallback(() => {
    const node = viewport.current
    if (node) { node.scrollLeft = (node.scrollWidth - node.clientWidth) / 2; node.scrollTop = (node.scrollHeight - node.clientHeight) / 2; sync() }
  }, [sync])
  // One frame owns the visual transaction. React commits the scale and every
  // overlay first; scroll compensation and Fabric controls follow before paint.
  const schedule = useCallback(value => {
    pending.current = value; desiredZoom.current = value.zoom
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const update = pending.current; pending.current = null
      const node = viewport.current
      if (!node || !paper.current || !update) return
      zoomRef.current = update.zoom
      flushSync(() => { setZoom(update.zoom); setSize({ width: node.clientWidth, height: node.clientHeight }) })
      if (update.center) center()
      else if (update.restore) {
        node.scrollLeft = update.restore.scrollLeft ?? 0; node.scrollTop = update.restore.scrollTop ?? 0
      } else {
        const rect = paper.current.getBoundingClientRect()
        node.scrollLeft += rect.left + update.doc.x * update.zoom - update.anchor.x
        node.scrollTop += rect.top + update.doc.y * update.zoom - update.anchor.y
      }
      sync()
    })
  }, [center, sync])
  const changeZoom = useCallback((value, point) => {
    const node = viewport.current, sheet = paper.current
    if (!node || !sheet) return
    const rect = sheet.getBoundingClientRect(), view = node.getBoundingClientRect()
    const anchor = point ?? { x: view.left + node.clientWidth / 2, y: view.top + node.clientHeight / 2 }
    const doc = { x: (anchor.x - rect.left) / zoomRef.current, y: (anchor.y - rect.top) / zoomRef.current }
    const next = Math.max(0.05, Math.min(4, typeof value === 'function' ? value(desiredZoom.current) : value))
    if (Number.isFinite(next)) schedule({ zoom: next, anchor, doc })
  }, [schedule])
  const fit = useCallback(() => {
    const node = viewport.current
    if (!node) return
    fitMode.current = true
    schedule({ zoom: Math.max(0.05, Math.min(4, (node.clientWidth - 96) / page.width, (node.clientHeight - 96) / page.height)), center: true })
  }, [page.width, page.height, schedule])
  useLayoutEffect(() => { sync() }, [zoom, size, page.width, page.height, sync])
  useEffect(() => () => { cancelAnimationFrame(frame.current); frame.current = 0; pending.current = null }, [])
  useEffect(() => {
    const node = viewport.current
    const observer = new ResizeObserver(() => {
      // The keyboard shrinks this area: re-fitting would zoom the page out under the text being typed.
      if (editing.current) return
      if (fitMode.current) fit()
      else if (pending.current) schedule(pending.current)
      else changeZoom(zoomRef.current)
    })
    observer.observe(node)
    const wheel = event => {
      if (!event.ctrlKey && !event.metaKey) return
      event.preventDefault(); fitMode.current = false
      changeZoom(value => value * Math.exp(-event.deltaY * 0.002), { x: event.clientX, y: event.clientY })
    }
    node.addEventListener('wheel', wheel, { passive: false }); node.addEventListener('scroll', sync, { passive: true })
    return () => { observer.disconnect(); node.removeEventListener('wheel', wheel); node.removeEventListener('scroll', sync) }
  }, [fit, changeZoom, schedule, sync])
  // Touch: two fingers pan and pinch-zoom anywhere (anchored at their
  // midpoint); one finger on the empty area around the page (or anywhere with
  // the hand tool) pans. One finger
  // on the page stays with Fabric (select, move). The viewport owns all touch
  // gestures (touch-action: none), so the browser never zooms the whole app.
  useEffect(() => {
    const node = viewport.current
    let gesture = null, pan = null, owned = false, first = null
    const midpoint = list => { const [a, b] = list; return { x: (a.clientX + b.clientX) / 2, y: (a.clientY + b.clientY) / 2, distance: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) } }
    // Fabric already started a one-finger interaction: bring that finger back to
    // where it began and end it there, so the gesture never moves an object.
    function releaseFabric() {
      if (!first || !paper.current?.contains(first.target)) return
      const init = { bubbles: true, cancelable: true, changedTouches: [first.touch] }
      first.target.dispatchEvent(new TouchEvent('touchmove', { ...init, touches: [first.touch], targetTouches: [first.touch] }))
      first.target.dispatchEvent(new TouchEvent('touchend', { ...init, touches: [], targetTouches: [] }))
    }
    const own = event => { event.preventDefault(); event.stopPropagation(); if (editing.current) editing.current.moved = true }
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
    return () => { for (const [type, listener] of listeners) node.removeEventListener(type, listener, options) }
  }, [schedule])
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
    schedule({ zoom: Math.max(0.05, Math.min(4, saved.zoom)), restore: saved })
  }, [schedule])
  // On touch, typing on the canvas opens the keyboard over half the screen. Keep
  // the line being written in the visible area at a readable size, and give the
  // person their previous view back when editing ends (unless they moved it).
  useEffect(() => {
    if (!window.matchMedia?.('(pointer: coarse)').matches) return undefined
    const isFabricInput = target => target instanceof Element && target.matches('textarea[data-fabric="textarea"]')
    const MIN_FONT_PX = 16, TOP_MARGIN = 72, BOTTOM_MARGIN = 24, SIDE_MARGIN = 16
    let timer = 0, watch = 0
    // `onlyIfHidden`: while typing, move the view only when the caret line leaves the visible band.
    function reveal(onlyIfHidden = false) {
      const node = viewport.current, bounds = editorRef.current?.textEditingBounds?.()
      if (!node || !paper.current || !bounds || !editing.current) return
      const area = node.getBoundingClientRect(), vv = window.visualViewport
      const top = Math.max(area.top, vv?.offsetTop ?? 0) + TOP_MARGIN, bottom = Math.min(area.bottom, vv ? vv.offsetTop + vv.height : area.bottom) - BOTTOM_MARGIN
      const left = Math.max(area.left, vv?.offsetLeft ?? 0) + SIDE_MARGIN, right = Math.min(area.right, vv ? vv.offsetLeft + vv.width : area.right) - SIDE_MARGIN
      if (bottom - top < 40 || right - left < 80) return
      if (onlyIfHidden) {
        const sheet = paper.current.getBoundingClientRect(), lineTop = sheet.top + bounds.caret.top * zoomRef.current, lineBottom = lineTop + bounds.caret.height * zoomRef.current
        if (lineTop >= top - TOP_MARGIN / 2 && lineBottom <= bottom + BOTTOM_MARGIN / 2) return
      }
      const next = Math.min(4, Math.max(zoomRef.current, MIN_FONT_PX / Math.max(bounds.fontSize, 1)))
      const fits = bounds.width * next <= right - left
      fitMode.current = false
      schedule({ zoom: next, doc: { x: fits ? bounds.left + bounds.width / 2 : bounds.left, y: bounds.caret.top + bounds.caret.height / 2 },
        anchor: { x: fits ? (left + right) / 2 : left, y: (top + bottom) / 2 } })
    }
    const later = (delay = 120, onlyIfHidden = false) => { clearTimeout(timer); timer = setTimeout(() => reveal(onlyIfHidden), delay) }
    function begin() {
      if (!editing.current) {
        const node = viewport.current
        editing.current = { saved: { zoom: zoomRef.current, scrollLeft: node?.scrollLeft ?? 0, scrollTop: node?.scrollTop ?? 0 }, fit: fitMode.current, moved: false }
        // The keyboard has no event of its own on every device; the edit ends when Fabric leaves editing.
        watch = setInterval(() => { if (!editorRef.current?.isEditingText()) finish() }, 400)
      }
      later(250)
    }
    function finish() {
      clearInterval(watch); clearTimeout(timer)
      const session = editing.current; editing.current = null
      if (!session || session.moved) return
      if (session.fit) { fitMode.current = true; fit() } else restore(session.saved)
    }
    const focusin = event => { if (isFabricInput(event.target)) begin() }
    const typing = event => { if (editing.current && isFabricInput(event.target)) later(80, true) }
    document.addEventListener('input', typing)
    const vv = window.visualViewport, onViewport = () => { if (editing.current) later(60) }
    document.addEventListener('focusin', focusin)
    vv?.addEventListener('resize', onViewport); vv?.addEventListener('scroll', onViewport)
    return () => {
      document.removeEventListener('focusin', focusin); document.removeEventListener('input', typing); vv?.removeEventListener('resize', onViewport); vv?.removeEventListener('scroll', onViewport)
      clearInterval(watch); clearTimeout(timer); editing.current = null
    }
  }, [editorRef, fit, restore, schedule])
  // A viewport-sized gutter keeps cursor anchoring possible even when the
  // paper is smaller than the viewport (scroll cannot otherwise go negative).
  const paperStyle = { position: 'absolute', left: Math.max(48, size.width), top: Math.max(48, size.height), transform: `scale(${zoom})`, transformOrigin: 'top left', width: page.width, height: page.height }
  const stageStyle = { position: 'relative', overflow: 'hidden', width: page.width * zoom + 2 * Math.max(48, size.width), height: page.height * zoom + 2 * Math.max(48, size.height) }
  return { viewport, paper, zoom, hand, setHand, center, fit, restore, size, panning, paperStyle, stageStyle,
    changeZoom: value => { fitMode.current = false; changeZoom(value) },
    // onAuxClick/onMouseDown keep the browser's middle-click autoscroll and link-open away.
    gestures: { onPointerDownCapture: down, onPointerMoveCapture: move, onPointerUpCapture: stop, onPointerCancel: stop,
      onMouseDownCapture: event => { if (event.button === 1) event.preventDefault() }, onAuxClick: event => event.preventDefault() } }
}
