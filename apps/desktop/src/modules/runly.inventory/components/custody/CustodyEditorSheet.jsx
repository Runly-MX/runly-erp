import { useEffect, useMemo, useState } from 'react'
import {
  Button, ComboboxField, DateField, SelectField, Sheet, SheetContent, SheetDescription, SheetFooter,
  SheetHeader, SheetTitle, TextareaField,
} from '@runly/ui'
import { toast } from 'sonner'
import { toLocalIso } from '../../../../lib/localDate.js'
import { CUSTODY_KIND_OPTIONS } from '../../lib/custody-api.js'
import { useCreateCustody, useDocumentTemplates, useEmployeeOptions, useUpdateCustody } from '../../hooks/useInventoryCustody.js'
import { CustodyItemsPicker } from './CustodyItemsPicker.jsx'

const DEFAULT_TEMPLATE = '__default__'

function initialForm(custody, defaults) {
  if (custody) {
    return {
      kind: custody.kind ?? 'DELIVERY',
      employeeId: custody.employeeId ?? '',
      date: String(custody.date ?? '').slice(0, 10) || toLocalIso(),
      comments: custody.comments ?? '',
      templateId: custody.templateId ?? DEFAULT_TEMPLATE,
      items: custody.items.map((row) => ({
        id: row.itemId ?? row.item?.id ?? row.id,
        name: row.item?.name ?? ([row.typeBrand, row.model].filter(Boolean).join(' ') || null),
        assetTag: row.assetTag ?? row.item?.assetTag,
        serialNumber: row.serialNumber ?? row.item?.serialNumber,
      })),
    }
  }
  return {
    kind: defaults?.kind ?? 'DELIVERY',
    employeeId: defaults?.employeeId ?? '',
    date: toLocalIso(),
    comments: '',
    templateId: DEFAULT_TEMPLATE,
    items: defaults?.items ?? [],
  }
}

// Create a custody record or edit one still in DRAFT. Signatures, preview and
// completion live on the detail screen.
export function CustodyEditorSheet({ open, onOpenChange, custody = null, defaults = null, onSaved }) {
  const [form, setForm] = useState(() => initialForm(custody, defaults))
  const employees = useEmployeeOptions({ enabled: open })
  const templates = useDocumentTemplates({ enabled: open })
  const create = useCreateCustody()
  const update = useUpdateCustody()
  const busy = create.isPending || update.isPending

  useEffect(() => {
    if (open) setForm(initialForm(custody, defaults))
  }, [open, custody, defaults])

  const templateOptions = useMemo(() => [
    { value: DEFAULT_TEMPLATE, label: 'Plantilla predeterminada' },
    ...(templates.data ?? []).filter((t) => t.enabled !== false).map((t) => ({
      value: t.id, label: t.name, description: String(t.format ?? '').toUpperCase() || undefined,
    })),
  ], [templates.data])

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))
  const canSave = form.employeeId && form.items.length > 0 && form.date

  async function submit() {
    const payload = {
      kind: form.kind,
      employeeId: form.employeeId,
      date: form.date,
      comments: form.comments.trim() || undefined,
      itemIds: form.items.map((row) => row.id),
      templateId: form.templateId === DEFAULT_TEMPLATE ? undefined : form.templateId,
    }
    try {
      const saved = custody?.id
        ? await update.mutateAsync({ id: custody.id, ...payload })
        : await create.mutateAsync(payload)
      toast.success(custody?.id ? 'Resguardo actualizado' : 'Resguardo creado')
      onOpenChange(false)
      onSaved?.(saved)
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo guardar el resguardo')
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-xl">
        <SheetHeader className="shrink-0 border-b border-[hsl(var(--border))] px-5 py-4">
          <SheetTitle>{custody?.id ? `Editar resguardo ${custody.folio ?? ''}` : 'Nuevo resguardo'}</SheetTitle>
          <SheetDescription>Documento de entrega o devolución de equipo firmado por el colaborador.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-5 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField label="Tipo" required options={CUSTODY_KIND_OPTIONS} value={form.kind} onValueChange={set('kind')} disabled={busy} />
            <DateField label="Fecha" required value={form.date} onChange={(e) => set('date')(e.target.value)} disabled={busy} />
          </div>
          <ComboboxField
            label="Colaborador"
            required
            options={employees.options}
            value={form.employeeId}
            onChange={set('employeeId')}
            loading={employees.isLoading}
            disabled={busy}
            placeholder="Seleccionar colaborador..."
            searchPlaceholder="Buscar colaborador..."
          />
          <CustodyItemsPicker value={form.items} onChange={set('items')} disabled={busy} />
          <SelectField label="Plantilla del documento" options={templateOptions} value={form.templateId}
            onValueChange={set('templateId')} disabled={busy}
            hint="Si la empresa no tiene plantillas, se usa el formato estándar." />
          <TextareaField label="Comentarios" value={form.comments} maxLength={2000} disabled={busy}
            placeholder="Condiciones del equipo, accesorios incluidos, acuerdos..."
            onChange={(e) => set('comments')(e.target.value)} />
        </div>
        <SheetFooter className="shrink-0 border-t border-[hsl(var(--border))] px-5 py-4">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={busy || !canSave}>
            {busy ? 'Guardando...' : custody?.id ? 'Guardar cambios' : 'Crear resguardo'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
