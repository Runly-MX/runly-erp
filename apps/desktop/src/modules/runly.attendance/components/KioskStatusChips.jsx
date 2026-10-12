import { Badge } from '@runly/ui'
import { kioskStatus } from '../lib/attendanceLabels.js'

export function KioskStatusBadge({ kiosk }) {
  const status = kioskStatus(kiosk)
  return (
    <Badge variant={status.variant}>
      {status.key === 'online' ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" /> : null}
      {status.label}
    </Badge>
  )
}
