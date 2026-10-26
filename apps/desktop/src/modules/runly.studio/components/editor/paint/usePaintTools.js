import { useEffect, useRef } from 'react'
import { DEFAULT_GRADIENT, editGradientStop, gradientPaint, reverseGradient } from '../../../../../../../shared/studio/gradient.js'
import { fillKind } from '../../../lib/paint.js'

// Engine glue for v6 paints. `shape` drives the selected shape's gradient
// through the editor's stop operations; `page` edits page.backgroundPaint by
// replacing it (setPageGradient). Gestures use the ordered begin/end of
// useImageTools so a drag is one undo step.
export function usePaintTools({ editorRef, page, selection, begin, end, onError, fillShape }) {
  const editor = () => editorRef.current
  // Last gradient seen on the selection: switching to "Degradado" again restores it.
  const lastGradient = useRef(null)
  useEffect(() => { if (selection?.fillPaint?.type === 'gradient') lastGradient.current = selection.fillPaint }, [selection?.fillPaint])
  const pagePaint = useRef(page.backgroundPaint ?? null)
  useEffect(() => { pagePaint.current = page.backgroundPaint ?? null }, [page.backgroundPaint])
  const setPage = paint => { pagePaint.current = gradientPaint(paint); return editor().setPageGradient(pagePaint.current) }
  const pageCurrent = () => pagePaint.current ?? DEFAULT_GRADIENT

  const shape = {
    begin, end,
    set: paint => editor().setGradient(paint),
    updateStop: (index, patch) => editor().updateGradientStop(index, patch),
    addStop: stop => editor().addGradientStop(stop),
    removeStop: index => editor().removeGradientStop(index),
    reverse: () => editor().reverseGradient(),
    reset: () => editor().resetGradient(),
  }
  const pageApi = {
    begin, end,
    set: setPage,
    updateStop: (index, patch) => setPage(editGradientStop(pageCurrent(), index, patch)),
    addStop: stop => setPage({ ...pageCurrent(), stops: [...pageCurrent().stops, stop].sort((a, b) => a.offset - b.offset) }),
    removeStop: index => setPage({ ...pageCurrent(), stops: pageCurrent().stops.filter((_, i) => i !== index) }),
    reverse: () => setPage(reverseGradient(pageCurrent())),
    reset: () => setPage(DEFAULT_GRADIENT),
  }

  // Fill type of the selected shape: none / solid / gradient / photo, as one undo step.
  async function setKind(kind) {
    const item = selection
    if (!item || kind === fillKind(item)) return
    const base = item.fillPaint?.type ?? 'solid', hidden = item.shape?.fillEnabled === false
    try {
      if (kind === 'image') {
        if (hidden) await editor().setShapeStyle({ fillEnabled: true })
        if (base !== 'image') await fillShape()
        return
      }
      await begin()
      try {
        if (kind === 'none') await editor().setShapeStyle({ fillEnabled: false })
        else {
          if (hidden) await editor().setShapeStyle({ fillEnabled: true })
          if (kind === 'solid' && base !== 'solid') await editor().setSolidFill(item.fill)
          if (kind === 'gradient' && base !== 'gradient') await editor().setGradient(lastGradient.current ?? DEFAULT_GRADIENT)
        }
        await end(true)
      } catch (error) { await end(false); throw error }
    } catch (error) { onError(error.message) }
  }
  const run = action => Promise.resolve().then(action).catch(error => onError(error.message))
  return {
    shape, page: pageApi, setKind,
    setPageColor: color => run(() => editor().setPageBackground(color)),
    pageGradient: paint => run(() => setPage(paint ?? pageCurrent())),
    // Reuse one gradient between the page and the selected shape.
    toPage: paint => run(() => setPage(paint)),
    toSelection: paint => run(() => editor().setGradient(paint)),
  }
}
