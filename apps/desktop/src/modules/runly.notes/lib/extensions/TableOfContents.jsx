import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { TableOfContentsView } from '../../components/TableOfContentsView.jsx'

// Live table of contents block: renders the document's headings and keeps
// itself updated; it stores no content of its own.
export const TableOfContents = Node.create({
  name: 'tableOfContents',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="table-of-contents"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'table-of-contents' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableOfContentsView)
  },

  addCommands() {
    return {
      insertTableOfContents: () => ({ chain }) => chain().insertContent({ type: 'tableOfContents' }).run(),
    }
  },
})
