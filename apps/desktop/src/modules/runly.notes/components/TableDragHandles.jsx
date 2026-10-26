import { useEffect, useLayoutEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { useCurrentEditor } from '@tiptap/react'
import { Selection } from '@tiptap/pm/state'
import { Plus } from 'lucide-react'
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

// Edge strips that append a column (right edge) or a row (bottom edge) in one
// click. The commands act on the selection, so the caret is first moved into
// the table's last cell, which is always in the last column and last row.
function TableAddControls({ editor, pos, dom }) {
  const [box, setBox] = useState(null)

  useLayoutEffect(() => {
    const table = dom.querySelector(':scope > table')
    if (!table) return undefined
    const measure = () => setBox(prev => {
      const next = { left: table.offsetLeft, width: table.offsetWidth, height: table.offsetHeight }
      return prev && prev.left === next.left && prev.width === next.width && prev.height === next.height ? prev : next
    })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(table)
    return () => observer.disconnect()
  }, [dom])

  if (!box) return null

  function add(command) {
    const node = editor.state.doc.nodeAt(pos)
    if (!node || node.type.name !== 'table') return
    const $end = editor.state.doc.resolve(pos + node.nodeSize - 2)
    editor.chain().focus().setTextSelection(Selection.near($end, -1).from)[command]().run()
  }

  const strip = 'note-table-add absolute flex items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors'
  const stop = e => e.preventDefault()

  return (
    <>
      <button
        type="button"
        aria-label="Agregar columna"
        title="Agregar columna"
        data-html2canvas-ignore
        className={strip}
        style={{ left: box.left + box.width + 2, top: 0, width: 18, height: box.height }}
        onMouseDown={stop}
        onClick={() => add('addColumnAfter')}
      >
        <Plus size={14} />
      </button>
      <button
        type="button"
        aria-label="Agregar fila"
        title="Agregar fila"
        data-html2canvas-ignore
        className={strip}
        style={{ left: box.left, top: box.height + 2, width: box.width, height: 18 }}
        onMouseDown={stop}
        onClick={() => add('addRowAfter')}
      >
        <Plus size={14} />
      </button>
    </>
  )
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
            add: makeHost('absolute left-0 top-0 h-0 w-0'),
          }
          dom.prepend(entry.grip)
          dom.append(entry.add)
          hosts.set(dom, entry)
        }
        next.push({ pos, dom, grip: entry.grip, add: entry.add })
      })
      for (const [dom, entry] of hosts) {
        if (!current.has(dom)) { entry.grip.remove(); entry.add.remove(); hosts.delete(dom) }
      }
      setTables(previous => previous.length === next.length && previous.every((table, i) =>
        table.pos === next[i].pos && table.grip === next[i].grip,
      ) ? previous : next)
    }
    update()
    editor.on('update', update)
    return () => {
      editor.off('update', update)
      for (const entry of hosts.values()) { entry.grip.remove(); entry.add.remove() }
    }
  }, [editor])

  return tables.map(({ pos, dom, grip, add }) => [
    createPortal(<TableHandle editor={editor} pos={pos} dom={dom} />, grip, `g${pos}`),
    createPortal(<TableAddControls editor={editor} pos={pos} dom={dom} />, add, `a${pos}`),
  ])
}
