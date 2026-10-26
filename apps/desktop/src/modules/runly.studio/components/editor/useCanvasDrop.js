import { useEffect, useRef, useState } from 'react'
import { hitTest, isStudioDrag, peekStudioDrag, registerDropZone, takeStudioDrag } from '../../lib/studio-drag.js'
import { canHoldPhoto } from '../../lib/photo-target.js'

const DEFAULT_SIZE = { width: 240, height: 180 }

// Drop target for panel → canvas drag and drop (mouse HTML5 drag and touch
// press-and-drag). Elements land centred on the drop point, shown first as a
// landing outline of their real size; a photo dropped on a photo frame
// replaces its picture, and on a compatible shape becomes its photo fill (v5
// setPhotoFill): the shape keeps its id, geometry, border, opacity and order.
export function useCanvasDrop({ editorRef, canvasRef, objects, readOnly, attempt }) {
  const [target, setTarget] = useState(null), [landing, setLanding] = useState(null)
  const zone = useRef(null)
  const pointFrom = event => {
    const rect = canvasRef.current?.getBoundingClientRect(), canvas = canvasRef.current
    if (!rect?.width) return null
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }
  }
  const frameUnder = (point, payload) => point && payload?.kind === 'photo' ? hitTest(objects, point, object => object.type === 'image' || canHoldPhoto(object)) : null

  async function fillWithPhoto(frame, fileAssetId) {
    const editor = editorRef.current
    editor.select(frame.id, { individual: true })
    // A photo already in the frame or shape is swapped, keeping its framing.
    if (frame.type === 'image' || frame.fillPaint?.type === 'image') return editor.replaceImage(frame.id, fileAssetId)
    return editor.setPhotoFill(fileAssetId, { fit: 'cover' })
  }
  function hover(event, payload) {
    const point = pointFrom(event), frame = frameUnder(point, payload)
    setTarget(current => (current?.id === frame?.id ? current : frame))
    const size = payload?.size ?? DEFAULT_SIZE
    setLanding(!frame && point ? { x: point.x - size.width / 2, y: point.y - size.height / 2, width: size.width, height: size.height, label: payload?.label } : null)
  }
  const leave = () => { setTarget(null); setLanding(null) }
  function dropAt(event, payload) {
    const point = pointFrom(event), frame = frameUnder(point, payload)
    leave()
    if (payload) attempt(() => (frame ? fillWithPhoto(frame, payload.fileAssetId) : payload.insert(point)))
  }
  // Touch drags report points to this zone (the design area section).
  const handlersRef = useRef({ hover, leave, dropAt })
  useEffect(() => { handlersRef.current = { hover, leave, dropAt } })
  useEffect(() => {
    if (readOnly) return undefined
    return registerDropZone({ get element() { return zone.current },
      over: point => handlersRef.current.hover(point, peekStudioDrag()), leave: () => handlersRef.current.leave(),
      drop: (point, payload) => handlersRef.current.dropAt(point, payload) })
  }, [readOnly])

  const handlers = readOnly ? {} : {
    onDragOver: event => {
      if (!isStudioDrag(event)) return
      event.preventDefault(); event.dataTransfer.dropEffect = 'copy'
      hover(event, peekStudioDrag())
    },
    onDragLeave: event => { if (!event.currentTarget.contains(event.relatedTarget)) leave() },
    onDrop: event => {
      if (!isStudioDrag(event)) return
      event.preventDefault()
      dropAt(event, takeStudioDrag())
    },
  }
  return { handlers, target, landing, zoneRef: zone }
}
