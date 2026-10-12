import { useEffect, useState } from 'react'
import { Button, ComboboxField, SelectField, SwitchField, TextField } from '@runly/ui'
import { useSaveKiosk } from '../hooks/useAttendanceData.js'
import { KIOSK_MODE_OPTIONS, kioskLink } from '../lib/attendanceLabels.js'
import { FormSheet, LinkBlock, toOptions, useCreateAnother } from './shared.jsx'

const EMPTY = { name: '', siteId: null, mode: 'both', allowPin: true, requireSelfie: false }

// Create / edit a kiosk. When editing, also shows the public link + QR.
export function KioskSheet({ open, onOpenChange, kiosk, lookups }) {
  const save = useSaveKiosk()
  const [form, setForm] = useState(EMPTY)
  const [nameError, setNameError] = useState('')
  const another = useCreateAnother()
  useEffect(() => {
    if (!open) return
    setNameError('')
    setForm(kiosk
      ? { name: kiosk.name ?? '', siteId: kiosk.siteId ?? null, mode: kiosk.mode ?? 'both', allowPin: kiosk.allowPin !== false, requireSelfie: Boolean(kiosk.requireSelfie) }
      : EMPTY)
  }, [open, kiosk])
  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))

  async function submit() {
    if (!form.name.trim()) { setNameError('El nombre es obligatorio.'); return }
    try {
      await save.mutateAsync({ id: kiosk?.id, name: form.name.trim(), siteId: form.siteId || null, mode: form.mode, allowPin: form.allowPin, requireSelfie: form.requireSelfie })
      another.finish({ close: () => onOpenChange(false), reset: () => { setForm(EMPTY); setNameError('') } })
    } catch { /* toast shown */ }
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={kiosk ? 'Editar kiosko' : 'Nuevo kiosko'}
      createAnother={{ visible: !kiosk, checked: another.checked, onChange: another.setChecked }}
      bodyRef={another.bodyRef}
      description="Un kiosko es la tableta o equipo donde el personal marca su asistencia."
      footer={(
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={save.isPending}>{save.isPending ? 'Guardando…' : kiosk ? 'Guardar' : 'Crear'}</Button>
        </>
      )}
    >
      <TextField label="Nombre" required value={form.name} onChange={(e) => set('name')(e.target.value)} error={nameError} placeholder="Ej. Entrada principal" />
      <ComboboxField label="Sitio" options={toOptions(lookups.rows.sites)} value={form.siteId} onChange={set('siteId')} clearable placeholder="Sin sitio" />
      <SelectField label="Modo" options={KIOSK_MODE_OPTIONS} value={form.mode} onValueChange={set('mode')} />
      <SwitchField label="Permitir PIN" description="Además de tarjeta y llave de teléfono." checked={form.allowPin} onChange={set('allowPin')} />
      <SwitchField label="Requerir selfie" description="Toma una foto en cada checada." checked={form.requireSelfie} onChange={set('requireSelfie')} />
      {kiosk?.linkToken ? <LinkBlock label="Enlace del kiosko" value={kioskLink(window.location.origin, kiosk.linkToken)} /> : null}
    </FormSheet>
  )
}
