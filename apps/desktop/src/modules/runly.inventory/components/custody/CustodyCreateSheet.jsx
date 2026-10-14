import { useEffect, useState } from 'react'
import {
  Button, ComboboxField, SelectField, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle,
} from '@runly/ui'
import { toast } from 'sonner'
import { useAuth } from '../../../../auth/AuthProvider'
import { toLocalIso } from '../../../../lib/localDate.js'
import { CUSTODY_KIND_OPTIONS } from '../../lib/custody-api.js'
import { useCreateCustody, useEmployeeOptions } from '../../hooks/useInventoryCustody.js'
import { useInventoryCan } from '../../hooks/useInventoryAdmin.js'
import { CustodyDelivererField, DELIVER_ON_BEHALF } from './CustodyDelivererField.jsx'

// Minimal creation: kind + employee (+ deliverer when permitted). Items,
// template, comments and signatures are edited on the detail screen.
export function CustodyCreateSheet({ open, onOpenChange, defaults = null, onCreated }) {
  const { userProfile } = useAuth()
  const can = useInventoryCan()
  const canDelegate = can(DELIVER_ON_BEHALF)
  const [form, setForm] = useState({ kind: 'DELIVERY', employeeId: '', delivererId: '' })
  const employees = useEmployeeOptions({ enabled: open })
  const create = useCreateCustody()

  useEffect(() => {
    if (open) setForm({ kind: defaults?.kind ?? 'DELIVERY', employeeId: defaults?.employeeId ?? '', delivererId: userProfile?.id ?? '' })
  }, [open, defaults, userProfile?.id])

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))

  async function submit() {
    try {
      const created = await create.mutateAsync({
        kind: form.kind,
        employeeId: form.employeeId,
        date: toLocalIso(),
        itemIds: [],
        ...(canDelegate && form.delivererId ? { delivererId: form.delivererId } : {}),
      })
      toast.success('Resguardo creado', { description: 'Agrega los artículos y recaba las firmas.' })
      onOpenChange(false)
      onCreated?.(created)
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo crear el resguardo')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="shrink-0 border-b border-[hsl(var(--border))] px-5 py-4">
          <SheetTitle>Nuevo resguardo</SheetTitle>
          <SheetDescription>Elige el tipo y el colaborador. Los artículos, la plantilla y las firmas se agregan en el detalle.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <SelectField label="Tipo" required options={CUSTODY_KIND_OPTIONS} value={form.kind} onValueChange={set('kind')} disabled={create.isPending} />
          <ComboboxField
            label="Colaborador"
            required
            options={employees.options}
            value={form.employeeId}
            onChange={set('employeeId')}
            loading={employees.isLoading}
            disabled={create.isPending}
            placeholder="Seleccionar colaborador..."
            searchPlaceholder="Buscar colaborador..."
          />
          <CustodyDelivererField value={form.delivererId} onChange={set('delivererId')} canDelegate={canDelegate} disabled={create.isPending} />
        </div>
        <SheetFooter className="shrink-0 border-t border-[hsl(var(--border))] px-5 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={create.isPending || !form.employeeId}>
            {create.isPending ? 'Creando...' : 'Crear y continuar'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
