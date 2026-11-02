import { StatusPill } from '@runly/ui'
import { Archive, CheckCircle2, FileEdit, PauseCircle, PencilLine, Wrench } from 'lucide-react'

const ICONS = {
  draft: FileEdit,
  published: CheckCircle2,
  published_pending: PencilLine,
  legacy_published: CheckCircle2,
  unpublished: PauseCircle,
  maintenance: Wrench,
  archived: Archive,
  unknown: FileEdit,
}

// Always icon + text, never color alone. `state` comes from deriveSiteState().
export function SiteStatusChip({ state, size = 'md' }) {
  const Icon = ICONS[state?.key] ?? FileEdit
  return (
    <StatusPill
      tone={state?.tone ?? 'neutral'}
      icon={Icon}
      size={size}
      title={state?.approximate && state?.hasPending !== null ? 'Calculado comparando revisiones del borrador y de la versión publicada.' : undefined}
    >
      {state?.label ?? ''}
    </StatusPill>
  )
}
