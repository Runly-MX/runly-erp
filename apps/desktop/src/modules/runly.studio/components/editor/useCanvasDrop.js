import { useState } from 'react'
import { hitTest, isStudioDrag, peekStudioDrag, takeStudioDrag } from '../../lib/studio-drag.js'
import { canHoldPhoto } from '../../lib/photo-target.js'

// Drop target for panel → canvas drag and drop. Elements land where they are
// dropped; a photo dropped on a photo frame replaces its picture, and a photo
// dropped on a compatible shape becomes that shape's photo fill (v5
// setPhotoFill): the shape keeps its id, geometry, border, opacity and order.
export function useCanvasDrop({ editorRef, canvasRef, objects, readOnly, attempt }) {
  const [target, setTarget] = useState(null)
  const pointFrom = event => {
    const rect = canvasRef.current?.getBoundingClientRect(), canvas = canvasRef.current
    if (!rect?.width) return null
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }
  }
  const frameUnder = point => point && peekStudioDrag()?.kind === 'photo' ? hitTest(objects, point, object => object.type === 'image' || canHoldPhoto(object)) : null

  async function fillWithPhoto(frame, fileAssetId) {
    const editor = editorRef.current
    editor.select(frame.id, { individual: true })
    // A photo already in the frame or shape is swapped, keeping its framing.
    if (frame.type === 'image' || frame.fillPaint?.type === 'image') return editor.replaceImage(frame.id, fileAssetId)
    return editor.setPhotoFill(fileAssetId, { fit: 'cover' })
  }

  const handlers = readOnly ? {} : {
    onDragOver: event => {
      if (!isStudioDrag(event)) return
      event.preventDefault(); event.dataTransfer.dropEffect = 'copy'
      const frame = frameUnder(pointFrom(event))
      setTarget(current => (current?.id === frame?.id ? current : frame))
    },
    onDragLeave: event => { if (!event.currentTarget.contains(event.relatedTarget)) setTarget(null) },
    onDrop: event => {
      if (!isStudioDrag(event)) return
      event.preventDefault()
      const point = pointFrom(event), frame = frameUnder(point), payload = takeStudioDrag()
      setTarget(null)
      if (!payload) return
      attempt(() => (frame ? fillWithPhoto(frame, payload.fileAssetId) : payload.insert(point)))
    },
  }
  return { handlers, target }
}
