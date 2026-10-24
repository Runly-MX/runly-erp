import { NodeViewWrapper } from '@tiptap/react'
import { useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { Link2 } from 'lucide-react'
import { Skeleton } from '@runly/ui'
import { NoteInteractionContext } from './NoteInteractionContext.js'
import { useResolvedReference } from '../hooks/useRelationTargets.js'
import { referenceTypeOf } from '../lib/entityReferenceTypes.js'

const CHIP =
  'mx-0.5 inline-flex min-h-8 max-w-full items-center gap-1.5 rounded-md bg-muted px-2 align-middle text-sm text-foreground'

// Inline chip for an entityReference node. The title is resolved per viewer;
// the public view never calls the API and never links.
export function EntityReferenceChip({ node, selected }) {
  const { entityType, recordId } = node.attrs
  const { isPublic } = useContext(NoteInteractionContext)
  const navigate = useNavigate()
  const type = referenceTypeOf(entityType)
  const Icon = type?.Icon ?? Link2
  const { data, status } = useResolvedReference(entityType, recordId, { enabled: !isPublic })
  const selectedClass = selected ? 'bg-accent' : ''

  let body
  if (isPublic) {
    body = (
      <span className={`${CHIP} ${selectedClass} text-muted-foreground`} title="Registro vinculado">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span>Registro vinculado</span>
      </span>
    )
  } else if (status === 'pending') {
    body = (
      <span className={`${CHIP} ${selectedClass}`} aria-busy="true">
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <Skeleton className="h-3 w-20 rounded" />
      </span>
    )
  } else if (!data) {
    body = (
      <span className={`${CHIP} ${selectedClass} text-muted-foreground`} title="Registro no disponible">
        <Icon className="h-3.5 w-3.5 shrink-0" />
        <span>Registro no disponible</span>
      </span>
    )
  } else {
    body = (
      <a
        href={data.url ?? undefined}
        title={data.subtitle ? `${data.title} - ${data.subtitle}` : data.title}
        className={`${CHIP} ${selectedClass} cursor-pointer no-underline hover:bg-accent`}
        onClick={(event) => {
          // Let the browser open a new tab on modified clicks.
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return
          event.preventDefault()
          if (data.url) navigate(data.url)
        }}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="max-w-[28ch] truncate">{data.title}</span>
      </a>
    )
  }

  return (
    <NodeViewWrapper as="span" data-type="entity-reference" contentEditable={false}>
      {body}
    </NodeViewWrapper>
  )
}
