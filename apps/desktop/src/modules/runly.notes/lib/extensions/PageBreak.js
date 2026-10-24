import { Node, mergeAttributes } from '@tiptap/core'

// Explicit page break block. TrailingNode keeps an empty paragraph after it,
// so a break at the end of the document never traps the caret.
export const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  draggable: true,

  parseHTML() {
    return [{ tag: 'div[data-type="page-break"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'page-break', class: 'note-page-break' }),
      ['span', { class: 'note-page-break__label' }, 'Salto de pagina'],
    ]
  },

  addCommands() {
    return {
      setPageBreak: () => ({ chain }) => chain().insertContent({ type: 'pageBreak' }).run(),
    }
  },

  addKeyboardShortcuts() {
    return {
      'Mod-Enter': () => this.editor.commands.setPageBreak(),
    }
  },
})
