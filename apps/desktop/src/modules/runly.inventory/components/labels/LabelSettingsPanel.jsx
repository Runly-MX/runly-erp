import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, SelectField } from '@runly/ui'
import { MoreHorizontal, Printer, RotateCcw, Save, Star, Trash2 } from 'lucide-react'
import { LabelTemplateEditor } from './LabelTemplateEditor.jsx'

const NO_PRINTER = 'browser'

// Right panel: template choice + editor, and the printer that receives the labels.
export function LabelSettingsPanel({
  templates, printers, templateId, onTemplateChange, printerId, onPrinterChange,
  draft, onDraftChange, dirty, canManage, busy, plan,
  onSaveChanges, onSaveAs, onReset, onMakeDefault, onDeleteTemplate, onManagePrinters,
}) {
  const template = templates.find((t) => t.id === templateId) ?? null
  const templateOptions = templates.map((t) => ({ value: t.id, label: t.name, description: `${Number(t.widthMm)} × ${Number(t.heightMm)} mm`, badge: t.isDefault ? 'Predeterminada' : undefined }))
  const printerOptions = [
    { value: NO_PRINTER, label: 'Navegador (PDF)', description: 'Diálogo de impresión del sistema' },
    ...printers.map((p) => ({ value: p.id, label: p.name, description: `${p.format.toUpperCase()} · ${p.dpi} dpi`, badge: p.isDefault ? 'Predeterminada' : undefined })),
  ]

  return (
    <div className="space-y-5">
      <section className="space-y-2">
        <div className="flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <SelectField label="Plantilla" options={templateOptions} value={templateId ?? undefined}
              placeholder="Elegir plantilla" disabled={busy} onValueChange={onTemplateChange} />
          </div>
          {canManage && template ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button type="button" variant="outline" size="icon" className="h-9 w-9 shrink-0" aria-label="Opciones de la plantilla" disabled={busy}>
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {!template.isDefault ? (
                  <DropdownMenuItem onSelect={onMakeDefault}><Star className="mr-2 h-4 w-4" />Usar como predeterminada</DropdownMenuItem>
                ) : null}
                <DropdownMenuItem onSelect={onDeleteTemplate} className="text-[hsl(var(--destructive))]">
                  <Trash2 className="mr-2 h-4 w-4" />Eliminar plantilla
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        {dirty ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-[hsl(var(--muted)/0.6)] px-3 py-2 text-xs">
            <span className="mr-auto text-[hsl(var(--muted-foreground))]">Cambios sin guardar; se imprimen así.</span>
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={onReset}>
              <RotateCcw className="mr-1 h-3.5 w-3.5" />Descartar
            </Button>
            {canManage && template ? (
              <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" disabled={busy} onClick={onSaveChanges}>
                <Save className="mr-1 h-3.5 w-3.5" />Guardar
              </Button>
            ) : null}
          </div>
        ) : null}
        {canManage ? (
          <Button type="button" variant="ghost" size="sm" className="h-8 px-2 text-xs" disabled={busy} onClick={onSaveAs}>
            <Save className="mr-1.5 h-3.5 w-3.5" />Guardar como plantilla nueva
          </Button>
        ) : null}
      </section>

      <LabelTemplateEditor key={templateId ?? 'none'} draft={draft} onChange={onDraftChange} disabled={busy} />

      <section className="space-y-2 border-t border-[hsl(var(--border))] pt-4">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Impresora</h3>
        <SelectField label="Enviar a" options={printerOptions} value={printerId ?? NO_PRINTER} disabled={busy}
          onValueChange={(v) => onPrinterChange(v === NO_PRINTER ? null : v)} />
        <p className="text-xs text-[hsl(var(--muted-foreground))]">
          {plan.available
            ? (plan.format === 'zpl' ? 'Se descarga un archivo .zpl para enviarlo a la impresora Zebra.' : plan.transportId === 'file' ? 'Se descarga el archivo de etiquetas.' : 'Se abre el PDF; imprímelo desde el diálogo del sistema al tamaño real.')
            : `${plan.reason}. Usa Descargar mientras tanto.`}
        </p>
        {canManage ? (
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onManagePrinters}>
            <Printer className="mr-1.5 h-3.5 w-3.5" />Administrar impresoras
          </Button>
        ) : null}
      </section>
    </div>
  )
}
