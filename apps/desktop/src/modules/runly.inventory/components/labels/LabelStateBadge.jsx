import { Badge } from '@runly/ui'
import { labelState } from '../../lib/label-queue.js'

// "Etiquetada N veces" / "Sin etiquetar"; nothing while the stats are unknown.
export function LabelStateBadge({ labelPrintCount, labelPrintedAt, className }) {
  const state = labelState({ labelPrintCount, labelPrintedAt })
  if (!state) return null
  return (
    <Badge variant={state.labeled ? 'success' : 'outline'} className={className} title={state.detail || undefined}>
      {state.text}
    </Badge>
  )
}

// Registry key: runly.inventory:LabelStateCell — item list column.
export default function LabelStateCell({ row }) {
  return <LabelStateBadge labelPrintCount={row?.labelPrintCount} labelPrintedAt={row?.labelPrintedAt} />
}
