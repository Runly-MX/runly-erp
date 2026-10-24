import { NodeViewWrapper } from '@tiptap/react'
import { useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link2, Lock } from 'lucide-react'
import { Skeleton } from '@runly/ui'
import { NoteInteractionContext } from './NoteInteractionContext.js'
import { useResolvedReference } from '../hooks/useRelationTargets.js'
import { useEntityBranding } from '../../runly.chat/hooks/useEntityBranding'
import { EntityPreviewPopover } from '../../runly.chat/components/EntityPreviewPopover'

// Same look as the chat's inline connector chip: the owning module's icon and
// color tint the chip (translucent, so the ruled paper lines run through it)
// with a colored underline. Hover/tap opens the shared record preview card.
const CHIP =
  'mx-0.5 inline-flex max-w-full items-center gap-1 rounded px-1 align-baseline text-sm font-medium text-foreground'

function chipStyle(color, selected) {
  return {
    backgroundColor: `color-mix(in srgb, ${color} ${selected ? 34 : 18}%, transparent)`,
    boxShadow: `inset 0 -2px 0 ${color}`,
  }
}

// An entityReference node. The title is resolved per viewer; the public view
// never calls the API and never links.
export function EntityReferenceChip({ node, selected }) {
  const { entityType, recordId } = node.attrs
  const { isPublic } = useContext(NoteInteractionContext)
  const navigate = useNavigate()
  const brand = useEntityBranding()(entityType)
  const Icon = brand.Icon ?? Link2
  const muted = 'hsl(var(--muted-foreground))'
  const { data, status } = useResolvedReference(entityType, recordId, { enabled: !isPublic })

  let body
  if (isPublic) {
    body = (
      <span className={`${CHIP} text-muted-foreground`} style={chipStyle(muted, selected)} title="Registro vinculado">
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>Registro vinculado</span>
      </span>
    )
  } else if (status === 'pending') {
    body = (
      <span className={CHIP} style={chipStyle(brand.color, selected)} aria-busy="true">
        <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
        <Skeleton className="h-3 w-20 rounded" />
      </span>
    )
  } else if (!data) {
    // No permission for the record or its module, or it was deleted: the API
    // cannot tell them apart and neither does the chip. No name, no preview.
    body = (
      <span className={`${CHIP} text-muted-foreground`} style={chipStyle(muted, selected)} title="Este registro no existe o no tienes acceso.">
        <Lock className="h-3 w-3 shrink-0" aria-hidden="true" />
        <span>Sin acceso</span>
      </span>
    )
  } else {
    body = (
      <EntityPreviewPopover entityType={entityType} recordId={recordId}>
        <span
          role="link"
          tabIndex={0}
          className={`${CHIP} cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]`}
          style={chipStyle(brand.color, selected)}
          onClick={(event) => {
            if (!data.url) return
            if (event.metaKey || event.ctrlKey || event.shiftKey) {
              window.open(data.url, '_blank', 'noopener')
              return
            }
            navigate(data.url)
          }}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && data.url) navigate(data.url)
          }}
        >
          <Icon className="h-3 w-3 shrink-0" aria-hidden="true" />
          <span className="max-w-[28ch] truncate">{data.title}</span>
        </span>
      </EntityPreviewPopover>
    )
  }

  return (
    <NodeViewWrapper as="span" data-type="entity-reference" contentEditable={false}>
      {body}
    </NodeViewWrapper>
  )
}
