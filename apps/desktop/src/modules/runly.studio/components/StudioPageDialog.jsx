import { useState } from 'react'
import { Button, Input, SelectField, CheckboxField, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, ErrorState } from '@runly/ui'
import { PAGE_PRESETS } from '../../../../../shared/studio/page.js'

export function StudioPageDialog({ open, onClose, page, onApply, creating = false, disabled = false }) {
  const [draft, setDraft] = useState(page), [preset, setPreset] = useState('custom'), [scale, setScale] = useState(false)
  const [error, setError] = useState(''), [busy, setBusy] = useState(false)
  async function apply() {
    try { setBusy(true); setError(''); await onApply(draft, scale); onClose() }
    catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  return <Dialog open={open} onOpenChange={value => { if (!value) onClose() }}><DialogContent><DialogHeader>
    <DialogTitle>{creating ? 'Crear diseño' : 'Tamaño y fondo'}</DialogTitle>
    <DialogDescription>Dimensiones en píxeles (32 a 4096 por lado). Los presets son orientativos; no representan medidas de impresión.</DialogDescription>
  </DialogHeader>
    <div className="space-y-4">
    <SelectField id="studio-page-preset" label="Tamaño de diseño" value={preset} disabled={disabled} options={PAGE_PRESETS} onChange={value => {
      setPreset(value); const next = PAGE_PRESETS.find(preset => preset.value === value)
      if (next.width) setDraft(current => ({ ...current, width: next.width, height: next.height }))
    }} />
    <div className="grid grid-cols-2 gap-3">{[['width','Anchura del diseño'],['height','Altura del diseño']].map(([key,label]) => <label key={key} className="space-y-1 text-sm">{label}
      <Input aria-label={label} type="number" min={32} max={4096} step={1} disabled={disabled} value={draft[key]} onChange={event => { setPreset('custom'); setDraft(current => ({ ...current, [key]: Number(event.target.value) })) }} />
    </label>)}</div>
    <label className="space-y-1 text-sm">Color de fondo<Input aria-label="Color de fondo" value={draft.background} disabled={disabled} maxLength={7} onChange={event => setDraft(current => ({ ...current, background: event.target.value }))} /></label>
    {!creating && <CheckboxField label="Escalar contenido proporcionalmente" checked={scale} onChange={event => setScale(event.target.checked)} disabled={disabled} hint="Si no lo marcas, los objetos mantienen sus coordenadas y tamaño, incluso fuera de la página." />}
    {error && <ErrorState description={error} showReport={false} />}
    <Button disabled={disabled || busy} onClick={apply}>{creating ? 'Crear con este tamaño' : 'Aplicar tamaño y fondo'}</Button>
    </div>
  </DialogContent></Dialog>
}
