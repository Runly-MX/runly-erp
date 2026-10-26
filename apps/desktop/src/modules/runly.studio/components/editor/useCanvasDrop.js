import { useState } from 'react'
import { hitTest, isStudioDrag, peekStudioDrag, photoMaskFor, takeStudioDrag } from '../../lib/studio-drag.js'

// Drop target for panel → canvas drag and drop. Elements land where they are
// dropped; a photo dropped on a photo frame replaces its picture, and a photo
// dropped on a shape (rectangle, circle, oval, triangle, star) becomes a
// photo with that shape as its frame, in the same place and stacking order.
export function useCanvasDrop({ editorRef, canvasRef, objects, readOnly, attempt }) {
  const [target, setTarget] = useState(null)
  const pointFrom = event => {
    const rect = canvasRef.current?.getBoundingClientRect(), canvas = canvasRef.current
    if (!rect?.width) return null
    return { x: (event.clientX - rect.left) * canvas.width / rect.width, y: (event.clientY - rect.top) * canvas.height / rect.height }
  }
  const frameUnder = point => point && peekStudioDrag()?.kind === 'photo' ? hitTest(objects, point, object => photoMaskFor(object)) : null

  async function fillWithPhoto(frame, fileAssetId) {
    const editor = editorRef.current
    if (frame.type === 'image') { editor.select(frame.id, { individual: true }); return editor.replaceImage(frame.id, fileAssetId) }
    const index = objects.findIndex(object => object.id === frame.id), above = objects.length - 1 - index
    await editor.beginInteraction()
    try {
      await editor.add('image', { fileAssetId, x: frame.x, y: frame.y, width: frame.width, height: frame.height, rotation: frame.rotation ?? 0, opacity: frame.opacity ?? 1, image: { mask: photoMaskFor(frame), fit: 'cover' } })
      const photoId = editor.snapshot().objects.at(-1).id
      editor.select(frame.id, { individual: true }); editor.remove()
      editor.select(photoId)
      for (let step = 0; step < above; step++) editor.order('down')
      await editor.endInteraction(true)
    } catch (error) { await editor.endInteraction(false); throw error }
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
