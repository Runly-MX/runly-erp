import { AlertTriangle, ExternalLink } from 'lucide-react'
import { IDENTIFIER_CONFLICT_MESSAGES } from '../hooks/useIdentifierConflicts.js'
import { RestrictedDuplicateNote } from './proposals/RestrictedDuplicateNote.jsx'

export function itemUrl(id) {
  return `/app/m/runly.inventory/inventory/${id}`
}

// Inline warning shown under the serial / asset number field when an active item already uses it.
export function InventoryIdentifierConflict({ field, item, onPropose = null }) {
  if (!item) return null
  // An item outside the user's areas comes without data: no link to open, but a way forward.
  if (item.restricted) return <RestrictedDuplicateNote field={field} onPropose={onPropose} />
  const label = [item.name, item.assetTag ? `N.º ${item.assetTag}` : null].filter(Boolean).join(' · ')
  return (
    <p role="alert" className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs text-[hsl(var(--warning,var(--destructive)))]">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <span>{IDENTIFIER_CONFLICT_MESSAGES[field]}.</span>
      <a href={itemUrl(item.id)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium underline underline-offset-2">
        Ver inventario{label ? ` (${label})` : ''}
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
    </p>
  )
}
