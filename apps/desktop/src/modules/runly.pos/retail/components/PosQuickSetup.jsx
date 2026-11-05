// apps/desktop/src/modules/runly.pos/retail/components/PosQuickSetup.jsx
import { useState } from 'react'
import { Button, TextField, cn } from '@runly/ui'
import { Layers, Store, Utensils } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../../lib/runly.js'

export const MODE_TILES = [
  { value: 'RETAIL', icon: Store, title: 'Tienda', text: 'Venta directa en mostrador: buscas o escaneas, cobras y entregas ticket.' },
  { value: 'RESTAURANT', icon: Utensils, title: 'Restaurante', text: 'Mesas, comandas y cocina; cobras la cuenta al final.' },
  { value: 'HYBRID', icon: Layers, title: 'Mixto', text: 'Mostrador y mesas en la misma caja.' },
]

// Large selectable tiles for the business mode (setup and Administración).
export function ModeTiles({ value, onChange, disabled }) {
  return (
    <div role="radiogroup" aria-label="Cómo vendes" className="grid gap-3 sm:grid-cols-3">
      {MODE_TILES.map(({ value: v, icon: Icon, title, text }) => {
        const active = value === v
        return (
          <button
            key={v}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => onChange(v)}
            className={cn(
              'flex flex-col items-start gap-2 rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-60',
              active ? 'border-(--brand-primary) bg-[hsl(var(--card))] shadow-[inset_0_0_0_1px_var(--brand-primary)]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-(--brand-primary)/60',
            )}
          >
            <span className={cn('flex h-11 w-11 items-center justify-center rounded-xl', active ? 'bg-(--brand-primary) text-(--brand-primary-foreground)' : 'bg-[hsl(var(--muted))] text-[hsl(var(--foreground))]')}>
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
            <span className="text-base font-bold text-[hsl(var(--foreground))]">{title}</span>
            <span className="text-sm text-[hsl(var(--muted-foreground))]">{text}</span>
          </button>
        )
      })}
    </div>
  )
}

// First run from the register: one step to start selling.
export default function PosQuickSetup({ token, onDone }) {
  const [mode, setMode] = useState('RETAIL')
  const [outletName, setOutletName] = useState('Sucursal principal')
  const [terminalName, setTerminalName] = useState('Caja 1')
  const [saving, setSaving] = useState(false)
  const valid = outletName.trim() && terminalName.trim()

  async function submit(event) {
    event.preventDefault()
    if (!valid || saving) return
    setSaving(true)
    try {
      await runly.pos.setup({ mode, outletName: outletName.trim(), terminalName: terminalName.trim() }, token)
      toast.success('Punto de venta listo')
      onDone()
    } catch (error) {
      toast.error(error?.message ?? 'No se pudo configurar el punto de venta.')
      if (error?.status === 409) onDone()
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={submit} className="mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-3xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-5 shadow-sm sm:p-8">
      <div className="flex flex-col gap-1">
        <h2 className="text-2xl font-bold text-[hsl(var(--foreground))]">Empecemos a vender</h2>
        <p className="text-[hsl(var(--muted-foreground))]">Elige cómo vendes y nombra tu sucursal y tu caja. Podrás cambiarlo después en Administración.</p>
      </div>
      <ModeTiles value={mode} onChange={setMode} disabled={saving} />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Sucursal" required value={outletName} onChange={(e) => setOutletName(e.target.value)} maxLength={160} icon={null} />
        <TextField label="Caja" required value={terminalName} onChange={(e) => setTerminalName(e.target.value)} maxLength={160} icon={null} />
      </div>
      <p className="text-sm text-[hsl(var(--muted-foreground))]">Se agregan Efectivo, Tarjeta y Transferencia como formas de pago.</p>
      <Button type="submit" size="lg" className="h-14 text-lg font-bold" disabled={!valid} loading={saving}>Crear y empezar</Button>
    </form>
  )
}
