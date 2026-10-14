import { Badge } from '@runly/ui'
import { CUSTODY_STATUS } from '../../lib/custody-api.js'

export function CustodyStatusBadge({ status }) {
  const meta = CUSTODY_STATUS[status] ?? { label: status ?? '—', variant: 'secondary' }
  return <Badge variant={meta.variant}>{meta.label}</Badge>
}
