import { useCallback, useEffect, useRef, useState } from 'react'
import { imageProperties } from '../../../../../../../shared/studio/image-properties.js'
import { framePatch, shapeOutline } from '../../../lib/frame-shapes.js'
import { canHoldPhoto, photoOf } from '../../../lib/photo-target.js'

// Glue between the Studio photo UI and the engine (fabric-adapter). Live
// gestures (sliders, framing drags) never toggle the workspace "busy" state,
// so controls stay enabled mid-gesture; each gesture is one undo step via
// beginInteraction/endInteraction. Errors surface through onError.
export function useImageTools({ editorRef, selection, objects, resolveImage, readOnly, onError, openPanel, ensureSaved }) {
  const editor = () => editorRef.current
  const run = useCallback(async action => { try { return await action() } catch (error) { onError(error.message) } }, [onError])
  // begin/end run strictly in order: the engine's endInteraction awaits pending
  // adjustments, so an unchained begin from the next key press would overtake it.
  const interacting = useRef(false), chain = useRef(Promise.resolve())
  const inOrder = step => (chain.current = chain.current.then(step, step))
  const begin = useCallback(() => run(() => inOrder(async () => { if (interacting.current) return; await editor().beginInteraction(); interacting.current = true })), [run]) // eslint-disable-line react-hooks/exhaustive-deps
  const end = useCallback((commit = true) => run(() => inOrder(async () => { if (!interacting.current) return; interacting.current = false; await editor().endInteraction(commit) })), [run]) // eslint-disable-line react-hooks/exhaustive-deps

  // Signed URL of the selected photo (frame or shape fill), for previews (filters, frames).
  const [urls, setUrls] = useState({})
  const photo = photoOf(selection), fileId = photo?.fileId ?? null
  // Signed URLs expire in 60 s, so previews use a local blob URL fetched once.
  const blobs = useRef(new Map())
  useEffect(() => () => { for (const url of blobs.current.values()) URL.revokeObjectURL(url) }, [])
  useEffect(() => {
    if (!fileId || urls[fileId]) return undefined
    const controller = new AbortController()
    ;(async () => {
      const signed = await resolveImage(fileId)
      const response = await fetch(signed, { signal: controller.signal })
      if (!response.ok) throw Error('preview unavailable')
      const local = URL.createObjectURL(await response.blob())
      if (controller.signal.aborted) { URL.revokeObjectURL(local); return }
      blobs.current.set(fileId, local); setUrls(current => ({ ...current, [fileId]: local }))
    })().catch(() => {})
    return () => controller.abort()
  }, [fileId, resolveImage, urls])

  // Natural size of the selected photo (framing limits and the outside "ghost").
  const [sizes, setSizes] = useState({})
  const url = fileId ? urls[fileId] : null
  useEffect(() => {
    if (!url || sizes[fileId]) return undefined
    const image = new Image()
    image.onload = () => setSizes(current => ({ ...current, [fileId]: { width: image.naturalWidth, height: image.naturalHeight } }))
    image.src = url
    return () => { image.onload = null }
  }, [url, fileId, sizes])

  // Framing mode (pan/zoom the photo inside a fixed mask).
  const [framing, setFraming] = useState(null)
  const startFraming = () => run(async () => {
    if (!photo || selection.locked || readOnly) return
    await begin(); setFraming(selection.id)
  })
  const finishFraming = commit => { setFraming(null); end(commit) }
  useEffect(() => { if (framing && selection?.id !== framing) { setFraming(null); end(true) } }, [framing, selection?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Choosing a frame or "replace photo" without a usable selection waits for the next inserted photo.
  const [pending, setPending] = useState(null)
  const known = useRef(new Set(objects.map(object => object.id)))
  useEffect(() => {
    const added = objects.filter(object => !known.current.has(object.id))
    known.current = new Set(objects.map(object => object.id))
    const fresh = added.find(object => object.type === 'image')
    if (!pending || !fresh) return
    const job = pending
    setPending(null)
    run(async () => {
      try {
        if (job.kind === 'frame') { editor().select(fresh.id); await editor().patchImage(framePatch(job.preset)) }
        else {
          // The inserted photo only carries the file: it is removed and its file
          // goes into the target (replace a photo, or fill a shape).
          editor().select(fresh.id); editor().remove(); editor().select(job.targetId, { individual: true })
          if (job.kind === 'fill') await editor().setPhotoFill(fresh.fileAssetId, { fit: 'cover' })
          else await editor().replaceImage(job.targetId, fresh.fileAssetId)
        }
        await end(true)
      } catch (error) { await end(false); throw error }
    })
  }, [objects]) // eslint-disable-line react-hooks/exhaustive-deps
  const cancelPending = () => { setPending(null); end(false) }

  const editable = Boolean(selection) && !selection.locked && !readOnly
  const isImage = selection?.type === 'image' && editable, isPhoto = Boolean(photo) && editable
  const [background, setBackground] = useState(null)
  const tools = {
    imageUrl: fileId ? urls[fileId] : null,
    photo,
    begin, end,
    patch: patch => run(() => editor().patch(patch)),
    image: patch => run(() => editor().patchImage(patch)),
    adjust: patch => run(() => editor().updateImageAdjustments(patch)),
    filter: adjustments => run(() => editor().patchImage({ adjustments })),
    resetAdjustments: () => run(() => editor().resetImageAdjustments()),
    resetFraming: () => run(() => editor().resetImageFraming()),
    // The photo editor reads the image through the design's saved assets, so a
    // just-inserted photo needs the design saved first.
    editImage: () => run(async () => {
      if (ensureSaved) await ensureSaved()
      await editor().editImage()
    }),
    startFraming,
    openPanel,
    frame: preset => run(async () => {
      if (isImage) return editor().patchImage(framePatch(preset))
      await begin(); setPending({ kind: 'frame', preset }); openPanel(null, 'images')
    }),
    replace: () => run(async () => {
      if (!isPhoto) return
      await begin(); setPending({ kind: 'replace', targetId: selection.id }); openPanel(null, 'images')
    }),
    // Shape photo fills (v5): place waits for the next chosen photo; removing
    // restores the shape's solid color. The Files original is never touched.
    fillShape: () => run(async () => {
      if (!editable || !canHoldPhoto(selection)) return
      await begin(); setPending({ kind: 'fill', targetId: selection.id }); openPanel(null, 'images')
    }),
    removePhotoFill: () => run(() => editor().removePhotoFill()),
    shapeStyle: patch => run(() => editor().setShapeStyle(patch)),
    // Only offered when the engine really implements it (no placeholder control).
    removeBackground: isImage && typeof editor()?.removeBackground === 'function' ? () => setBackground(selection.id) : null,
  }
  const backgroundRemoval = background ? {
    open: true, onOpenChange: open => { if (!open) setBackground(null) },
    run: options => editor().removeBackground(background, options),
  } : null
  const framingProps = framing && selection?.id === framing && photo ? imageProperties(photo.image) : null
  return { tools, framing: framingProps ? { item: selection, props: framingProps, natural: sizes[fileId] ?? null, imageUrl: url, outline: photo.shape ? shapeOutline(selection) : null } : null,
    finishFraming, pending, cancelPending, backgroundRemoval }
}
