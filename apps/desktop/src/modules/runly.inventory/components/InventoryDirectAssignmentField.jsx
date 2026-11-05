import { useMemo, useState } from 'react'
import { Button, ComboboxField, PersonAvatar } from '@runly/ui'
import { RotateCcw, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useAssignInventoryItem, useInventoryItemAssignments, useReturnInventoryItem } from '../hooks/useInventoryItems.js'
import { useInventoryCan } from '../hooks/useInventoryAdmin.js'
import { useEmployeeOptions } from '../hooks/useInventoryCustody.js'
import { AssignmentHistoryRow, formatDate } from './InventoryAssignmentPanel.jsx'

const personName = (p) => [p?.firstName, p?.lastName].filter(Boolean).join(' ')

// RunlyForm "custom" field of the item form: assign the item straight to a
// collaborator, without a resguardo, for items that do not need one. Editing
// assigns/returns at once (each change lands in the assignment history);
// creating keeps the pick and InventoryItemForm assigns it after the save.
export function InventoryDirectAssignmentField({ value, onChange, initialData, onFieldChange }) {
  const can = useInventoryCan()
  const canManage = can('inventory.assignment.manage')
  const itemId = initialData?.id ?? null
  const employees = useEmployeeOptions({ enabled: canManage })
  const assign = useAssignInventoryItem()
  const giveBack = useReturnInventoryItem()
  const history = useInventoryItemAssignments(canManage ? itemId : null)
  const [pick, setPick] = useState('')
  // What the last action returned wins over the form's initial data.
  const [holder, setHolder] = useState(() => (initialData?.assignedToId
    ? { id: initialData.assignedToId, name: personName(initialData.assignedTo), avatarUrl: initialData.assignedTo?.avatarUrl, since: initialData.assignedAt }
    : null))
  const records = useMemo(() => {
    const raw = history.data?.data ?? history.data ?? []
    return [...raw].sort((a, b) => new Date(b.assignedAt) - new Date(a.assignedAt))
  }, [history.data])

  if (!canManage) return null

  if (!itemId) {
    return (
      <ComboboxField label="Asignar directamente a" placeholder="Sin asignar" searchPlaceholder="Buscar colaborador..."
        options={employees.options} loading={employees.isLoading} value={value ?? ''} clearable
        onValueChange={(next) => onChange(next || '')}
        hint="Sin resguardo: se asigna al guardar y queda en el historial." />
    )
  }

  const blocked = initialData?.adminStatus === 'registration_pending' ? 'Confirma el alta antes de asignarlo.'
    : initialData?.adminStatus === 'deregistered' ? 'Está dado de baja.' : ''

  async function doAssign() {
    try {
      await assign.mutateAsync({ itemId, employeeId: pick })
      const option = employees.options.find((o) => o.value === pick)
      setHolder({ id: pick, name: option?.label ?? '', since: new Date().toISOString() })
      setPick('')
      // The form resends status on save; keep it in step so the API accepts it.
      onFieldChange?.('status', 'assigned')
      toast.success('Activo asignado')
    } catch (err) { toast.error(err?.message ?? 'No se pudo asignar el activo') }
  }
  async function doReturn() {
    try {
      await giveBack.mutateAsync({ itemId })
      setHolder(null)
      onFieldChange?.('status', 'available')
      toast.success('Devolución registrada')
    } catch (err) { toast.error(err?.message ?? 'No se pudo registrar la devolución') }
  }

  return (
    <div className="space-y-3">
      {holder ? (
        <div className="flex items-center gap-3">
          <PersonAvatar name={holder.name || '—'} src={holder.avatarUrl} size="md" />
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-sm font-medium">{holder.name || '—'}</span>
            <span className="text-xs text-[hsl(var(--muted-foreground))]">desde {formatDate(holder.since)}</span>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={doReturn} disabled={giveBack.isPending}>
            <RotateCcw className="mr-1 h-3.5 w-3.5" />
            Devolver
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-0 flex-1 sm:max-w-sm">
            <ComboboxField label="Asignar directamente a" placeholder="Buscar colaborador..." searchPlaceholder="Buscar colaborador..."
              options={employees.options} loading={employees.isLoading} value={pick} onValueChange={(next) => setPick(next || '')}
              disabled={Boolean(blocked)} hint={blocked || 'Sin resguardo: queda registrado en el historial.'} />
          </div>
          <Button type="button" variant="outline" onClick={doAssign} disabled={!pick || assign.isPending || Boolean(blocked)}>
            <UserCheck className="mr-1 h-4 w-4" />
            Asignar
          </Button>
        </div>
      )}
      {records.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-medium text-[hsl(var(--muted-foreground))]">Historial</p>
          {records.map((r) => <AssignmentHistoryRow key={r.id} record={r} />)}
        </div>
      ) : null}
    </div>
  )
}
