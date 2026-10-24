import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCurrentEditor } from '@tiptap/react'
import { countPages } from '../lib/outline.js'

// Floating "N paginas" chip, shown only in paged view. Portaled into `host`
// (the editor container) so it floats over the viewport, not the sheet.
export function PageCounterChip({ host }) {
  const { editor } = useCurrentEditor()
  const [pages, setPages] = useState(1)

  useEffect(() => {
    if (!editor) return undefined
    let timer = null
    const refresh = () => setPages(countPages(editor.state.doc))
    const onUpdate = () => {
      clearTimeout(timer)
      timer = setTimeout(refresh, 200)
    }
    refresh()
    editor.on('update', onUpdate)
    return () => {
      clearTimeout(timer)
      editor.off('update', onUpdate)
    }
  }, [editor])

  if (!host) return null
  return createPortal(
    <div
      aria-live="polite"
      className="pointer-events-none absolute bottom-3 left-3 z-20 rounded-md border border-border bg-background/90 px-2.5 py-1 text-xs text-muted-foreground shadow-sm"
    >
      {pages} {pages === 1 ? 'pagina' : 'paginas'}
    </div>,
    host,
  )
}
