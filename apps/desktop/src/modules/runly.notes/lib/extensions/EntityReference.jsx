import { Node, mergeAttributes } from '@tiptap/core'
import { ReactNodeViewRenderer } from '@tiptap/react'
import { EntityReferenceChip } from '../../components/EntityReferenceChip.jsx'

// Inline atom linking to another Runly record. Only { entityType, recordId } is
// stored: the label is resolved live (per-viewer permission, never stale).
export const EntityReference = Node.create({
  name: 'entityReference',
  group: 'inline',
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      entityType: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-entity-type'),
        renderHTML: (attrs) => (attrs.entityType ? { 'data-entity-type': attrs.entityType } : {}),
      },
      recordId: {
        default: null,
        parseHTML: (el) => el.getAttribute('data-record-id'),
        renderHTML: (attrs) => (attrs.recordId ? { 'data-record-id': attrs.recordId } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: 'span[data-type="entity-reference"]' }]
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes(HTMLAttributes, { 'data-type': 'entity-reference' })]
  },

  addNodeView() {
    return ReactNodeViewRenderer(EntityReferenceChip, { as: 'span' })
  },

  addCommands() {
    return {
      insertEntityReference: ({ entityType, recordId }) => ({ chain }) =>
        chain()
          .insertContent([
            { type: 'entityReference', attrs: { entityType, recordId } },
            { type: 'text', text: ' ' },
          ])
          .run(),
    }
  },
})
