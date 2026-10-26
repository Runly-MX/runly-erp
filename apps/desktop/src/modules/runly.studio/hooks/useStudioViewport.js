import { useEffect, useRef, useState, useCallback } from 'react'

export function useStudioViewport(page, editorRef) {
  const viewport = useRef(null), paper = useRef(null), drag = useRef(null), space = useRef(false), fitMode = useRef(false)
  const [zoom, setZoom] = useState(0.5), [hand, setHand] = useState(false), [size, setSize] = useState({ width: 0, height: 0 })
  const zoomRef = useRef(zoom)
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
  return { viewport, paper, zoom, hand, setHand, center, fit, size, panning,
    changeZoom: value => { fitMode.current = false; changeZoom(value) },
    // onAuxClick/onMouseDown keep the browser's middle-click autoscroll and link-open away.
    gestures: { onPointerDownCapture: down, onPointerMoveCapture: move, onPointerUpCapture: stop, onPointerCancel: stop,
      onMouseDownCapture: event => { if (event.button === 1) event.preventDefault() }, onAuxClick: event => event.preventDefault() } }
}
