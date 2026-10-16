import { Button, SelectField } from '@runly/ui'
import { Bluetooth, FileDown, Globe, Settings2 } from 'lucide-react'
import { FieldHint } from './studio-ui.jsx'
import { normalizeTransport, transportLabel } from '../../lib/label-transports.js'
import { useBluetoothPrinting } from '../../hooks/useBluetoothPrinting.js'

const NO_PRINTER = 'browser'
export const TRANSPORT_ICONS = { browser: Globe, file: FileDown, bluetooth: Bluetooth }

export function planHint(plan) {
  if (plan.note) return plan.note
  if (plan.transportId === 'bluetooth') return 'Se envía en ZPL por Bluetooth a la impresora emparejada con este teléfono.'
  if (plan.format === 'zpl') return 'Se descarga un archivo .zpl para la impresora Zebra.'
  if (plan.transportId === 'file') return 'Se descarga el archivo de etiquetas.'
  return 'Se abre el PDF; imprímelo desde el diálogo del sistema al tamaño real (escala 100 %).'
}

// Compact printer selector: transport icon + format/dpi, with what "Imprimir" will do.
export function LabelPrinterSelect({ printers, printerId, onChange, plan, canManage, busy, onManage }) {
  const env = { bluetooth: useBluetoothPrinting() }
  const options = [
    { value: NO_PRINTER, label: 'Navegador (PDF)', description: 'Diálogo de impresión del sistema', icon: Globe },
    ...printers.map((p) => ({
      value: p.id,
      label: p.name,
      description: `${transportLabel(p.transport, env)} · ${p.format.toUpperCase()} · ${p.dpi} dpi`,
      badge: p.isDefault ? 'Predeterminada' : undefined,
      icon: TRANSPORT_ICONS[normalizeTransport(p.transport, p.format)] ?? Globe,
    })),
  ]
  return (
    <div className="space-y-2">
      <div className="flex items-end gap-2">
        <div className="min-w-0 flex-1">
          <SelectField label="Impresora" options={options} value={printerId ?? NO_PRINTER} disabled={busy}
            onValueChange={(v) => onChange(!v || v === NO_PRINTER ? null : v)} />
        </div>
        {canManage ? (
          <Button type="button" variant="outline" size="icon" className="h-10 w-10 shrink-0" aria-label="Administrar impresoras" title="Administrar impresoras" disabled={busy} onClick={onManage}>
            <Settings2 className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      <FieldHint tone={plan.note ? 'warning' : 'muted'}>{planHint(plan)}</FieldHint>
    </div>
  )
}
