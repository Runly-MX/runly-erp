import { useCallback, useEffect, useRef, useState } from 'react'
import { imageProperties } from '../../../../../../../shared/studio/image-properties.js'
import { framePatch } from '../../../lib/frame-shapes.js'

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

  // Signed URL of the selected photo, for previews (filters, frames).
  const [urls, setUrls] = useState({})
  const fileId = selection?.type === 'image' ? selection.fileAssetId : null
  useEffect(() => {
    if (!fileId || urls[fileId]) return undefined
    let active = true
    Promise.resolve(resolveImage(fileId)).then(url => { if (active && url) setUrls(current => ({ ...current, [fileId]: url })) }).catch(() => {})
    return () => { active = false }
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
    if (selection?.type !== 'image' || selection.locked) return
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
          editor().select(fresh.id); editor().remove(); editor().select(job.targetId)
          await editor().replaceImage(job.targetId, fresh.fileAssetId)
        }
        await end(true)
      } catch (error) { await end(false); throw error }
    })
  }, [objects]) // eslint-disable-line react-hooks/exhaustive-deps
  const cancelPending = () => { setPending(null); end(false) }

  const isImage = selection?.type === 'image' && !selection.locked && !readOnly
  const [background, setBackground] = useState(null)
  const tools = {
    imageUrl: fileId ? urls[fileId] : null,
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
      if (!isImage) return
      await begin(); setPending({ kind: 'replace', targetId: selection.id }); openPanel(null, 'images')
    }),
    // Only offered when the engine really implements it (no placeholder control).
    removeBackground: isImage && typeof editor()?.removeBackground === 'function' ? () => setBackground(selection.id) : null,
  }
  const backgroundRemoval = background ? {
    open: true, onOpenChange: open => { if (!open) setBackground(null) },
    run: options => editor().removeBackground(background, options),
  } : null
  const framingProps = framing && selection?.id === framing ? imageProperties(selection.image ?? {}) : null
  return { tools, framing: framingProps ? { item: selection, props: framingProps, natural: sizes[fileId] ?? null, imageUrl: url } : null,
    finishFraming, pending, cancelPending, backgroundRemoval }
}
