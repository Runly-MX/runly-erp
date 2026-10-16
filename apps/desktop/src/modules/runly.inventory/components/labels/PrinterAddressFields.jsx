import { useState } from 'react'
import { Button, SelectField } from '@runly/ui'
import { Bluetooth, Printer, RefreshCw, Settings } from 'lucide-react'
import { toast } from 'sonner'
import { bluetoothErrorMessage, bluetoothSettingsCodes, normalizeBluetoothAddress, testLabelZpl } from '../../lib/bluetooth-print.js'

const Note = ({ children }) => (
  <p className="rounded-md bg-[hsl(var(--muted))] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">{children}</p>
)

function ErrorNote({ code, onSettings }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-[hsl(var(--destructive)/0.4)] px-3 py-2 text-xs text-[hsl(var(--destructive))]">
      <span className="min-w-0 flex-1">{bluetoothErrorMessage(code)}</span>
      {bluetoothSettingsCodes.has(code) ? (
        <Button type="button" variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={onSettings}>
          <Settings className="mr-1.5 h-3.5 w-3.5" />Abrir ajustes
        </Button>
      ) : null}
    </div>
  )
}

// Bluetooth printer in the Android app: pick a paired device, send a test label.
function BluetoothAppFields({ form, set, bluetooth }) {
  const [devices, setDevices] = useState(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const address = normalizeBluetoothAddress(form.address)

  async function load() {
    setBusy('list'); setError(null)
    const res = await bluetooth.pairedDevices()
    setBusy(null)
    if (!res.ok) { setError(res.code); return }
    setDevices(res.devices)
  }

  async function testPrint() {
    setBusy('test'); setError(null)
    const res = await bluetooth.print(address, testLabelZpl(form))
    setBusy(null)
    if (res.ok) toast.success('Etiqueta de prueba enviada', { description: 'Si no salió, revisa el tamaño del rollo y que la impresora use ZPL.' })
    else setError(res.code)
  }

  const options = (devices ?? []).map((d) => ({ value: String(d.id).toUpperCase(), label: `${d.name} · ${d.id}` }))
  if (address && !options.some((o) => o.value === address)) options.unshift({ value: address, label: `Guardada · ${address}` })

  return (
    <div className="space-y-3">
      {devices === null ? (
        <div className="space-y-1.5">
          <p className="text-sm font-medium">Dispositivo</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{address ? `Emparejado: ${address}` : 'Elige la impresora entre los dispositivos emparejados con este teléfono.'}</p>
        </div>
      ) : options.length ? (
        <SelectField label="Dispositivo emparejado" options={options} value={address ?? undefined} placeholder="Elige la impresora"
          onValueChange={(value) => set({ address: value })} />
      ) : (
        <Note>No hay dispositivos emparejados. Empareja la impresora en los ajustes de Bluetooth de Android y vuelve a buscar.</Note>
      )}
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" disabled={Boolean(busy)} onClick={load}>
          {devices === null ? <Bluetooth className="mr-1.5 h-3.5 w-3.5" /> : <RefreshCw className="mr-1.5 h-3.5 w-3.5" />}
          {busy === 'list' ? 'Buscando...' : devices === null ? 'Buscar impresoras emparejadas' : 'Volver a buscar'}
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={Boolean(busy) || !address} onClick={testPrint}>
          <Printer className="mr-1.5 h-3.5 w-3.5" />{busy === 'test' ? 'Enviando...' : 'Imprimir prueba'}
        </Button>
      </div>
      {error ? <ErrorNote code={error} onSettings={bluetooth.openSettings} /> : null}
    </div>
  )
}

// Address part of the printer editor: only Bluetooth printers have one. In the
// Android app the paired device is picked; elsewhere the saved one is shown.
export function PrinterAddressFields({ form, set, bluetooth }) {
  if (form.transport !== 'bluetooth') return null
  if (bluetooth.available) return <BluetoothAppFields form={form} set={set} bluetooth={bluetooth} />
  return (
    <Note>
      {form.address ? `Dispositivo emparejado: ${form.address}. ` : ''}
      Esta impresora solo imprime desde la app Android de Runly; aquí, Imprimir descarga el archivo .zpl.
    </Note>
  )
}
