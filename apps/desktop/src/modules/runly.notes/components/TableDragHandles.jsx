import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCurrentEditor } from '@tiptap/react'
import { useBlockDragReorder } from '../hooks/useBlockDragReorder.js'
import { NoteBlockDragHandle } from './NoteBlockDragHandle.jsx'

function TableHandle({ editor, pos, dom }) {
  const drag = useBlockDragReorder({
    editor,
    getPos: () => pos,
    getBoxEl: () => dom,
    getFrameEl: () => dom,
    editable: editor.isEditable,
    isEditing: false,
  })
  return <NoteBlockDragHandle label="Mover tabla" drag={drag} placement="gutter" />
}

// TipTap's TableView owns the table/colgroup/tbody and column resizing.
// Its wrapper ignores mutations outside tbody, so controls can live in a
// portal there without entering the document or replacing that node view.
export function TableDragHandles() {
  const { editor } = useCurrentEditor()
  const [tables, setTables] = useState([])

  useEffect(() => {
    if (!editor) return
    const hosts = new Map()
    function makeHost(className) {
      const host = document.createElement('div')
      host.contentEditable = 'false'
      host.dataset.html2canvasIgnore = 'true'
      host.className = className
      return host
    }
    function update() {
      const next = []
      const current = new Set()
      editor.state.doc.forEach((node, pos) => {
        if (node.type.name !== 'table') return
        const dom = editor.view.nodeDOM(pos)
        if (!dom?.classList.contains('tableWrapper')) return
        current.add(dom)
        let entry = hosts.get(dom)
        if (!entry) {
          // Zero-size sticky anchor: the grip lives in the wrapper's left
          // gutter padding (see runtime.css) so it takes no canvas space.
          entry = {
            grip: makeHost('note-block sticky left-0 z-10 h-0 w-0'),
          }
          dom.prepend(entry.grip)
          hosts.set(dom, entry)
        }
        next.push({ pos, dom, grip: entry.grip })
      })
      for (const [dom, entry] of hosts) {
        if (!current.has(dom)) { entry.grip.remove(); hosts.delete(dom) }
      }
      setTables(previous => previous.length === next.length && previous.every((table, i) =>
        table.pos === next[i].pos && table.grip === next[i].grip,
      ) ? previous : next)
    }
    update()
    editor.on('update', update)
    return () => {
      editor.off('update', update)
      for (const entry of hosts.values()) entry.grip.remove()
    }
  }, [editor])

  return tables.map(({ pos, dom, grip }) => createPortal(
    <TableHandle editor={editor} pos={pos} dom={dom} />, grip, String(pos),
  ))
}
