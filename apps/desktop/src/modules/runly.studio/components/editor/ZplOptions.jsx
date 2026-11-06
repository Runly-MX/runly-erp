import { useEffect, useState } from 'react'
import { SegmentedControl, SelectField } from '@runly/ui'
import { Info } from 'lucide-react'
import { ZPL_DPI } from '../../lib/studio-zpl.js'
import { defaultPpi } from '../../lib/studio-export.js'

const NONE = '__file'

// ZPL target: a ZPL printer registered in Inventario (its dpi, Bluetooth from the
// Android app) or a plain .zpl download at a chosen dpi.
export function ZplOptions({ page, options, set, loadPrinters, onPrinters }) {
  const [printers, setPrinters] = useState([])
  useEffect(() => {
    let alive = true
    loadPrinters?.().then(list => { if (alive) { const zpl = list.filter(item => item.format === 'zpl'); setPrinters(zpl); onPrinters(zpl) } }).catch(() => {})
    return () => { alive = false }
  }, [loadPrinters, onPrinters])
  const printer = printers.find(item => item.id === options.printerId)
  const ppi = defaultPpi(page), mm = value => Math.round(value / ppi * 254) / 10
  return (
    <div className="space-y-4">
      {printers.length ? (
        <SelectField label="Impresora" value={printer?.id ?? NONE} onValueChange={id => { const next = printers.find(item => item.id === id); set({ printerId: next?.id ?? null, ...(next ? { dpi: next.dpi } : {}) }) }}
          options={[{ value: NONE, label: 'Ninguna: descargar el archivo .zpl' }, ...printers.map(item => ({ value: item.id, label: `${item.name} · ${item.dpi} dpi` }))]} />
      ) : null}
      {printer ? null : (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Resolución de la impresora</p>
          <SegmentedControl ariaLabel="Resolución de la impresora" value={String(options.dpi)} onChange={value => set({ dpi: Number(value) })} className="w-full [&_button]:min-w-0"
            options={ZPL_DPI.map(value => ({ value: String(value), label: `${value} dpi` }))} />
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Revisa la etiqueta de tu Zebra: la mayoría son de 203 dpi; las de alta definición, 300.</p>
        </div>
      )}
      <p className="flex gap-2 rounded-md bg-[hsl(var(--muted)/0.5)] p-2.5 text-xs text-[hsl(var(--muted-foreground))]">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span>Etiqueta de {mm(page.width)} × {mm(page.height)} mm (página actual). Textos, formas e imágenes se imprimen en blanco y negro como imagen; los códigos QR y de barras sin girar se envían como códigos nativos de la impresora para que se lean mejor.</span>
      </p>
    </div>
  )
}
