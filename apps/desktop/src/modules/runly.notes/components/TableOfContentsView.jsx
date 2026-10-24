import { NodeViewWrapper } from '@tiptap/react'
import { useEffect, useState } from 'react'
import { ListTree } from 'lucide-react'
import { extractOutline } from '../lib/outline.js'
import { scrollToHeading } from '../lib/scrollToHeading.js'

export function TableOfContentsView({ editor }) {
  const [items, setItems] = useState(() => extractOutline(editor.state.doc))

  useEffect(() => {
    let timer = null
    const refresh = () => setItems(extractOutline(editor.state.doc))
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

  return (
    <NodeViewWrapper
      data-type="table-of-contents"
      contentEditable={false}
      className="my-3 rounded-md border border-border bg-muted/30 px-4 py-3 select-none"
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
        <ListTree className="h-4 w-4 text-muted-foreground" />
        Contenido
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Agrega titulos para generar el contenido</p>
      ) : (
        <ul className="space-y-0.5">
          {items.map((item) => (
            <li key={item.id} style={{ paddingLeft: `${(item.level - 1) * 14}px` }}>
              <button
                type="button"
                onClick={() => scrollToHeading(editor, item.id)}
                className="text-left text-sm text-foreground/80 hover:text-foreground hover:underline"
              >
                {item.text}
              </button>
            </li>
          ))}
        </ul>
      )}
    </NodeViewWrapper>
  )
}
