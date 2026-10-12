import { useEffect, useState } from 'react'
import { Button, ComboboxField, SelectField, SwitchField, TextField } from '@runly/ui'
import { useSavePerson } from '../hooks/useAttendanceData.js'
import { KIND_OPTIONS } from '../lib/attendanceLabels.js'
import { FormSheet, toOptions } from './shared.jsx'

const EMPTY = { code: '', firstName: '', lastName: '', kind: 'internal', groupId: null, categoryId: null, shiftId: null, pin: '', enabled: true }

const fromPerson = (p) => ({
  code: p.code ?? '', firstName: p.firstName ?? '', lastName: p.lastName ?? '', kind: p.kind ?? 'internal',
  groupId: p.groupId ?? null, categoryId: p.categoryId ?? null, shiftId: p.shiftId ?? null, pin: '', enabled: p.enabled !== false,
})

// Create / edit sheet for an attendance person. `person` null = create.
export function PersonSheet({ open, onOpenChange, person, lookups }) {
  const save = useSavePerson()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  useEffect(() => {
    if (open) { setForm(person ? fromPerson(person) : EMPTY); setErrors({}) }
  }, [open, person])

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))
  const setText = (key) => (event) => set(key)(event.target.value)

  async function submit() {
    const next = {}
    if (!form.code.trim()) next.code = 'El código es obligatorio.'
    if (!form.firstName.trim()) next.firstName = 'El nombre es obligatorio.'
    if (form.pin && !/^\d{4,8}$/.test(form.pin)) next.pin = 'El PIN debe tener de 4 a 8 dígitos.'
    setErrors(next)
    if (Object.keys(next).length) return
    const payload = {
      id: person?.id, code: form.code.trim(), firstName: form.firstName.trim(), lastName: form.lastName.trim() || null, kind: form.kind,
      groupId: form.groupId || null, categoryId: form.categoryId || null, shiftId: form.shiftId || null, enabled: form.enabled,
    }
    if (form.pin) payload.pin = form.pin
    try { await save.mutateAsync(payload); onOpenChange(false) } catch { /* toast shown by the mutation */ }
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={person ? 'Editar persona' : 'Nueva persona'}
      description="Datos de la persona que registra entradas y salidas."
      footer={(
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={save.isPending}>{save.isPending ? 'Guardando…' : 'Guardar'}</Button>
        </>
      )}
    >
      <TextField label="Código de empleado" required value={form.code} onChange={setText('code')} error={errors.code} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Nombres" required value={form.firstName} onChange={setText('firstName')} error={errors.firstName} />
        <TextField label="Apellidos" value={form.lastName} onChange={setText('lastName')} />
      </div>
      <SelectField label="Tipo" options={KIND_OPTIONS} value={form.kind} onValueChange={set('kind')} />
      <ComboboxField label="Grupo" options={toOptions(lookups.rows.groups)} value={form.groupId} onChange={set('groupId')} clearable placeholder="Sin grupo" />
      <ComboboxField label="Categoría" options={toOptions(lookups.rows.categories)} value={form.categoryId} onChange={set('categoryId')} clearable placeholder="Sin categoría" />
      <ComboboxField label="Turno" options={toOptions(lookups.rows.shifts)} value={form.shiftId} onChange={set('shiftId')} clearable placeholder="Sin turno" />
      <TextField
        label="PIN (4 a 8 dígitos)" type="password" inputMode="numeric" autoComplete="new-password" value={form.pin} onChange={setText('pin')} error={errors.pin}
        hint={person?.hasPin ? 'Ya tiene un PIN. Déjalo vacío para conservarlo.' : 'Opcional. Permite checar en un kiosko con PIN.'}
      />
      {person ? <SwitchField label="Activo" description="Las personas inactivas no pueden checar." checked={form.enabled} onChange={set('enabled')} /> : null}
    </FormSheet>
  )
}
