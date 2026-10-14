import { useEffect, useMemo, useState } from 'react'
import { Button, Card, ComboboxField, DateField, SelectField, TextareaField } from '@runly/ui'
import { CUSTODY_KIND_OPTIONS } from '../../lib/custody-api.js'
import { useDocumentTemplates, useEmployeeOptions } from '../../hooks/useInventoryCustody.js'
import { useInventoryCan } from '../../hooks/useInventoryAdmin.js'
import { CustodyStatusBadge } from './CustodyStatusBadge.jsx'
import { CustodyDelivererField, DELIVER_ON_BEHALF } from './CustodyDelivererField.jsx'

const DEFAULT_TEMPLATE = '__default__'
const dateOnly = (value) => String(value ?? '').slice(0, 10)

// Inline editor for a DRAFT / PENDING_SIGNATURE record. Every field saves on
// its own; `apply` (guarded PATCH) warns before edits that clear signatures.
export function CustodyDetailsEditor({ custody, apply, busy }) {
  const can = useInventoryCan()
  const canDelegate = can(DELIVER_ON_BEHALF)
  const employees = useEmployeeOptions()
  const templates = useDocumentTemplates()
  const [comments, setComments] = useState(custody.comments ?? '')

  useEffect(() => { setComments(custody.comments ?? '') }, [custody.id, custody.comments])

  const templateOptions = useMemo(() => [
    { value: DEFAULT_TEMPLATE, label: 'Plantilla predeterminada' },
    ...(templates.data ?? []).filter((t) => t.enabled !== false).map((t) => ({
      value: t.id, label: t.name, description: String(t.format ?? '').toUpperCase() || undefined,
    })),
  ], [templates.data])

  const commentsDirty = comments.trim() !== (custody.comments ?? '').trim()

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Datos del resguardo</h3>
        <CustodyStatusBadge status={custody.status} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <SelectField label="Tipo" options={CUSTODY_KIND_OPTIONS} value={custody.kind} disabled={busy}
          onValueChange={(kind) => { if (kind !== custody.kind) apply({ kind }, 'Tipo actualizado') }} />
        <DateField label="Fecha" value={dateOnly(custody.date)} disabled={busy}
          onChange={(e) => { const date = e?.target ? e.target.value : e; if (date && date !== dateOnly(custody.date)) apply({ date }, 'Fecha actualizada') }} />
        <SelectField label="Plantilla del documento" options={templateOptions} value={custody.templateId ?? DEFAULT_TEMPLATE} disabled={busy}
          onValueChange={(value) => apply({ templateId: value === DEFAULT_TEMPLATE ? null : value }, 'Plantilla actualizada')} />
        <ComboboxField
          label="Colaborador (recibe)"
          options={employees.options}
          value={custody.employeeId ?? ''}
          onChange={(employeeId) => { if (employeeId && employeeId !== custody.employeeId) apply({ employeeId }, 'Colaborador actualizado') }}
          loading={employees.isLoading}
          disabled={busy}
          placeholder="Seleccionar colaborador..."
          searchPlaceholder="Buscar colaborador..."
        />
        <CustodyDelivererField
          label="Entrega"
          value={custody.delivererId ?? ''}
          canDelegate={canDelegate}
          fallbackName={custody.delivererName}
          disabled={busy}
          onChange={(delivererId) => { if (delivererId && delivererId !== custody.delivererId) apply({ delivererId }, 'Quien entrega fue actualizado') }}
        />
      </div>
      <div className="space-y-2">
        <TextareaField label="Comentarios" value={comments} maxLength={2000} rows={3} disabled={busy}
          placeholder="Condiciones del equipo, accesorios incluidos, acuerdos..."
          onChange={(e) => setComments(e.target.value)} />
        {commentsDirty ? (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setComments(custody.comments ?? '')} disabled={busy}>Descartar</Button>
            <Button type="button" size="sm" disabled={busy}
              onClick={() => apply({ comments: comments.trim() || null }, 'Comentarios guardados')}>Guardar comentarios</Button>
          </div>
        ) : null}
      </div>
    </Card>
  )
}
