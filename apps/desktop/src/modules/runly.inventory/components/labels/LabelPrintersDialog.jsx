import { useEffect, useState } from 'react'
import {
  Badge, Button, ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
  EmptyState, NumberField, SelectField, SwitchField, TextField,
} from '@runly/ui'
import { ArrowLeft, Pencil, Plus, Printer, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { useDeleteLabelPrinter, useSaveLabelPrinter } from '../../hooks/useInventoryLabels.js'
import { DPI_OPTIONS } from '../../lib/label-layout.js'
import { FORMAT_OPTIONS, TRANSPORT_OPTIONS, labelTransports, resolvePrintPlan } from '../../lib/label-transports.js'

const EMPTY = { name: '', format: 'pdf', dpi: 203, transport: 'browser', address: '', mediaWidthMm: '', mediaHeightMm: '', defaultTemplateId: '', isDefault: false }
const optionLabel = (options, value) => options.find((o) => o.value === value)?.label ?? value

function PrinterForm({ form, setForm, templates, errors }) {
  const set = (patch) => setForm((f) => ({ ...f, ...patch }))
  const plan = resolvePrintPlan(form, labelTransports)
  const needsAddress = form.transport === 'network' || form.transport === 'bluetooth'
  return (
    <div className="space-y-4">
      <TextField label="Nombre" required value={form.name} error={errors.name} placeholder="Zebra del almacén"
        onChange={(e) => set({ name: e.target.value })} />
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField label="Formato" options={FORMAT_OPTIONS} value={form.format} onValueChange={(format) => set({ format })} />
        <SelectField label="Resolución" options={DPI_OPTIONS} value={String(form.dpi)} onValueChange={(v) => set({ dpi: Number(v) })} />
      </div>
      <SelectField label="Conexión" options={TRANSPORT_OPTIONS} value={form.transport} onValueChange={(transport) => set({ transport })}
        hint={plan.available ? undefined : plan.reason} />
      {!plan.available ? (
        <p className="rounded-md bg-[hsl(var(--muted))] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
          La impresión directa por {form.transport === 'bluetooth' ? 'Bluetooth' : 'red'} estará disponible en la app. Mientras tanto puedes descargar el archivo y enviarlo a la impresora.
        </p>
      ) : null}
      {needsAddress ? (
        <TextField label={form.transport === 'network' ? 'Dirección IP y puerto' : 'Dirección del dispositivo'} value={form.address ?? ''}
          placeholder={form.transport === 'network' ? '192.168.1.50:9100' : 'AA:BB:CC:DD:EE:FF'} onChange={(e) => set({ address: e.target.value })} />
      ) : null}
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Ancho del rollo (mm)" min={1} max={500} allowNegative={false} value={form.mediaWidthMm ?? ''}
          onChange={(e) => set({ mediaWidthMm: e.target.value })} />
        <NumberField label="Alto de la etiqueta (mm)" min={1} max={500} allowNegative={false} value={form.mediaHeightMm ?? ''}
          onChange={(e) => set({ mediaHeightMm: e.target.value })} />
      </div>
      <SelectField label="Plantilla predeterminada" placeholder="Ninguna" value={form.defaultTemplateId || undefined}
        options={[{ value: 'none', label: 'Ninguna' }, ...templates.map((t) => ({ value: t.id, label: t.name }))]}
        onValueChange={(v) => set({ defaultTemplateId: v === 'none' ? '' : v })} />
      <SwitchField label="Impresora predeterminada" description="Se selecciona al abrir Etiquetas." checked={Boolean(form.isDefault)}
        onChange={(isDefault) => set({ isDefault: typeof isDefault === 'boolean' ? isDefault : isDefault?.target?.checked })} />
    </div>
  )
}

// Printers management: list, create, edit and deactivate (inventory.label.manage).
export function LabelPrintersDialog({ open, onOpenChange, printers, templates }) {
  const save = useSaveLabelPrinter()
  const remove = useDeleteLabelPrinter()
  const [form, setForm] = useState(null)
  const [errors, setErrors] = useState({})
  const [confirm, setConfirm] = useState(null)

  useEffect(() => { if (!open) { setForm(null); setErrors({}) } }, [open])

  function edit(printer) {
    setErrors({})
    setForm(printer ? {
      ...EMPTY, ...printer,
      address: printer.address ?? '', mediaWidthMm: printer.mediaWidthMm ?? '', mediaHeightMm: printer.mediaHeightMm ?? '', defaultTemplateId: printer.defaultTemplateId ?? '',
    } : { ...EMPTY, isDefault: printers.length === 0 })
  }

  async function submit() {
    if (!form.name.trim()) { setErrors({ name: 'Escribe un nombre.' }); return }
    try {
      await save.mutateAsync({
        id: form.id, name: form.name.trim(), format: form.format, dpi: Number(form.dpi), transport: form.transport,
        address: form.address || null, mediaWidthMm: form.mediaWidthMm === '' ? null : Number(form.mediaWidthMm),
        mediaHeightMm: form.mediaHeightMm === '' ? null : Number(form.mediaHeightMm), defaultTemplateId: form.defaultTemplateId || null,
        isDefault: Boolean(form.isDefault),
      })
      toast.success(form.id ? 'Impresora actualizada' : 'Impresora agregada')
      setForm(null)
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo guardar la impresora')
    }
  }

  async function confirmDelete() {
    try {
      await remove.mutateAsync(confirm.id)
      toast.success('Impresora eliminada')
      setConfirm(null)
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo eliminar la impresora')
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent scrollable size="lg">
          <DialogHeader icon={Printer}>
            <DialogTitle>{form ? (form.id ? 'Editar impresora' : 'Nueva impresora') : 'Impresoras de etiquetas'}</DialogTitle>
            <DialogDescription>
              {form ? 'Define el formato que acepta y cómo se le envían las etiquetas.' : 'Las impresoras guardadas aparecen al imprimir etiquetas.'}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-0.5">
            {form ? (
              <PrinterForm form={form} setForm={setForm} templates={templates} errors={errors} />
            ) : printers.length === 0 ? (
              <EmptyState icon={Printer} title="Sin impresoras"
                description="Sin impresora guardada, Imprimir genera un PDF para el diálogo de impresión del navegador." />
            ) : (
              <ul className="divide-y divide-[hsl(var(--border)/0.6)] rounded-md border border-[hsl(var(--border))]">
                {printers.map((printer) => (
                  <li key={printer.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <p className="flex items-center gap-2 truncate text-sm font-medium">
                        {printer.name}{printer.isDefault ? <Badge variant="secondary">Predeterminada</Badge> : null}
                      </p>
                      <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">
                        {optionLabel(FORMAT_OPTIONS, printer.format)} · {printer.dpi} dpi · {optionLabel(TRANSPORT_OPTIONS, printer.transport)}
                      </p>
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Editar ${printer.name}`} onClick={() => edit(printer)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8" aria-label={`Eliminar ${printer.name}`} onClick={() => setConfirm(printer)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter className="shrink-0">
            {form ? (
              <>
                <Button type="button" variant="outline" onClick={() => setForm(null)} disabled={save.isPending}>
                  <ArrowLeft className="mr-1.5 h-3.5 w-3.5" />Volver
                </Button>
                <Button type="button" onClick={submit} disabled={save.isPending}>{save.isPending ? 'Guardando...' : 'Guardar'}</Button>
              </>
            ) : (
              <>
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
                <Button type="button" onClick={() => edit(null)}><Plus className="mr-1.5 h-3.5 w-3.5" />Agregar impresora</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(v) => { if (!v) setConfirm(null) }}
        title="Eliminar impresora"
        description="Dejará de aparecer al imprimir. El historial de etiquetas impresas se conserva."
        detail={confirm?.name ?? ''}
        confirmLabel="Eliminar"
        onConfirm={confirmDelete}
        loading={remove.isPending}
      />
    </>
  )
}
