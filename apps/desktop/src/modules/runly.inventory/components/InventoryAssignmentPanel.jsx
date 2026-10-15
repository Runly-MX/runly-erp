import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Badge, Button, Card, PersonAvatar } from '@runly/ui'
import { UserCheck, RotateCcw } from 'lucide-react'
import { useInventoryItemAssignments } from '../hooks/useInventoryItems.js'
import { useInventoryCan } from '../hooks/useInventoryAdmin.js'
import { buildNewCustodyPath } from '../lib/custody-links.js'

function formatDate(str) {
  if (!str) return '—'
  return new Date(str).toLocaleDateString('es-PE', {
    day: '2-digit', month: 'short', year: 'numeric',
  })
}

function AssignmentHistoryRow({ record }) {
  const active = !record.returnedAt
  const name = [record.employee?.firstName, record.employee?.lastName].filter(Boolean).join(' ') || record.employeeName || '—'
  return (
    <div className="flex items-start gap-3 py-2 border-b border-[hsl(var(--border)/0.5)] last:border-0">
      <PersonAvatar name={name} src={record.employee?.avatarUrl} size="sm" className="mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{name}</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          {formatDate(record.assignedAt)}
          {record.returnedAt ? ` → ${formatDate(record.returnedAt)}` : ' — activo'}
        </p>
        {record.notes && (
          <p className="text-xs text-[hsl(var(--muted-foreground))] mt-0.5 italic">{record.notes}</p>
        )}
      </div>
      {active && (
        <Badge variant="success" className="shrink-0">Activo</Badge>
      )}
    </div>
  )
}

// Who holds the item + history. Changing the holder always goes through a
// resguardo (formal document); the direct assign/return endpoints are internal.
export function InventoryAssignmentPanel({ item }) {
  const navigate = useNavigate()
  const can = useInventoryCan()
  const canManage = can('inventory.custody.manage')

  const assignmentsQuery = useInventoryItemAssignments(item.id)
  const assignments = useMemo(() => {
    const raw = assignmentsQuery.data?.data ?? assignmentsQuery.data ?? []
    return [...raw].sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt))
  }, [assignmentsQuery.data])

  const holderId = item.assignedTo?.id ?? item.assignedToId ?? null
  const isAssigned = Boolean(holderId)
  const assignedToName = [item.assignedTo?.firstName, item.assignedTo?.lastName].filter(Boolean).join(' ') || '—'

  const startAssign = () => navigate(buildNewCustodyPath({ kind: 'DELIVERY', itemIds: [item.id] }))
  const startReturn = () => navigate(buildNewCustodyPath({ kind: 'RETURN', employeeId: holderId, itemIds: [item.id] }))

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">Asignacion</h3>
        {canManage ? (
          isAssigned ? (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={startReturn}
              title="Crea un resguardo de devolución con este artículo">
              <RotateCcw className="mr-1 h-3 w-3" />
              Devolver
            </Button>
          ) : (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={startAssign}
              title="Crea un resguardo de entrega con este artículo">
              <UserCheck className="mr-1 h-3 w-3" />
              Asignar
            </Button>
          )
        ) : null}
      </div>

      {isAssigned ? (
        <div className="flex items-center gap-3">
          <PersonAvatar name={assignedToName} src={item.assignedTo?.avatarUrl} size="md" />
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-medium">{assignedToName}</span>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">
              desde {formatDate(item.assignedAt)}
            </span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Sin asignacion activa</p>
      )}

      {assignments.length > 0 && (
        <div>
          <p className="text-xs font-medium text-[hsl(var(--muted-foreground))] mb-2">Historial</p>
          <div>
            {assignments.map(r => (
              <AssignmentHistoryRow key={r.id} record={r} />
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
