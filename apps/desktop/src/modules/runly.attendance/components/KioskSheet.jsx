import { useEffect, useMemo, useState } from 'react'
import { Button, ComboboxField, SegmentedControl, SwitchField, TextField } from '@runly/ui'
import { useKiosks, useSaveKiosk } from '../hooks/useAttendanceData.js'
import { KIOSK_MODE_OPTIONS, kioskLink } from '../lib/attendanceLabels.js'
import { suggestKioskName } from '../lib/formHelpers.js'
import { FieldShell } from './fields/FieldShell.jsx'
import { FormSheet, LinkBlock, toOptions, useCreateAnother } from './shared.jsx'

const EMPTY = { name: '', siteId: null, mode: 'both', allowPin: true, requireSelfie: false }

// Create / edit a kiosk. When editing, also shows the public link + QR.
export function KioskSheet({ open, onOpenChange, kiosk, lookups }) {
  const save = useSaveKiosk()
  const kiosks = useKiosks()
  const [form, setForm] = useState(EMPTY)
  const [nameError, setNameError] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const another = useCreateAnother()

  const sites = useMemo(() => (lookups.rows.sites ?? []).filter((s) => s.enabled !== false), [lookups.rows.sites])
  const onlySiteId = sites.length === 1 ? sites[0].id : null
  const existingNames = useMemo(() => (kiosks.data ?? []).map((k) => k.name), [kiosks.data])
  const suggestFor = (siteId) => suggestKioskName(existingNames, sites.find((s) => s.id === siteId)?.name)
  const freshForm = () => ({ ...EMPTY, siteId: onlySiteId, name: suggestFor(onlySiteId) })

  useEffect(() => {
    if (!open) return
    setNameError(''); setNameTouched(false)
    setForm(kiosk
      ? { name: kiosk.name ?? '', siteId: kiosk.siteId ?? null, mode: kiosk.mode ?? 'both', allowPin: kiosk.allowPin !== false, requireSelfie: Boolean(kiosk.requireSelfie) }
      : freshForm())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kiosk])

  // The suggested name follows the chosen site / kiosk list until the admin types their own.
  useEffect(() => {
    if (!open || kiosk || nameTouched) return
    const suggested = suggestFor(form.siteId)
    setForm((f) => (f.name === suggested ? f : { ...f, name: suggested }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kiosk, nameTouched, form.siteId, existingNames, sites])

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))

  async function submit() {
    if (!form.name.trim()) { setNameError('El nombre es obligatorio.'); return }
    try {
      await save.mutateAsync({ id: kiosk?.id, name: form.name.trim(), siteId: form.siteId || null, mode: form.mode, allowPin: form.allowPin, requireSelfie: form.requireSelfie })
      another.finish({ close: () => onOpenChange(false), reset: () => { setNameTouched(false); setForm(freshForm()); setNameError('') } })
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
      <TextField
        label="Nombre" required value={form.name} error={nameError} placeholder="Ej. Entrada principal"
        onChange={(e) => { setNameTouched(true); set('name')(e.target.value) }}
        hint={!kiosk && !nameTouched ? 'Nombre sugerido. Puedes cambiarlo.' : undefined}
      />
      <ComboboxField label="Sitio" options={toOptions(lookups.rows.sites)} value={form.siteId} onChange={set('siteId')} clearable placeholder="Sin sitio" />
      <FieldShell label="Qué puede registrar">
        <SegmentedControl ariaLabel="Qué puede registrar" options={KIOSK_MODE_OPTIONS} value={form.mode} onChange={set('mode')} />
      </FieldShell>
      <SwitchField label="Permitir PIN" description="Además de tarjeta y llave de teléfono. Útil si la persona olvidó su tarjeta." checked={form.allowPin} onChange={set('allowPin')} />
      <SwitchField label="Requerir selfie" description="Toma una foto en cada checada para confirmar la identidad." checked={form.requireSelfie} onChange={set('requireSelfie')} />
      {kiosk?.linkToken ? <LinkBlock label="Enlace del kiosko" value={kioskLink(window.location.origin, kiosk.linkToken)} /> : null}
    </FormSheet>
  )
}
