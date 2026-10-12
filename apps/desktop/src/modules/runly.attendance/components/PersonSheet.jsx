import { useEffect, useState } from 'react'
import { Button, ComboboxField, SelectField, SwitchField, TextField } from '@runly/ui'
import { useSavePerson } from '../hooks/useAttendanceData.js'
import { KIND_OPTIONS } from '../lib/attendanceLabels.js'
import { HrLinkPanel, HrLinkedChip, HrSuggestions, hrName } from './HrLinkPanel.jsx'
import { FormSheet, toOptions, useCreateAnother } from './shared.jsx'

const EMPTY = { code: '', firstName: '', lastName: '', kind: 'internal', groupId: null, categoryId: null, shiftId: null, pin: '', enabled: true }

const fromPerson = (p) => ({
  code: p.code ?? '', firstName: p.firstName ?? '', lastName: p.lastName ?? '', kind: p.kind ?? 'internal',
  groupId: p.groupId ?? null, categoryId: p.categoryId ?? null, shiftId: p.shiftId ?? null, pin: '', enabled: p.enabled !== false,
})

// Splits "Nombre Apellido" when the HR record only has a full name.
function splitName(hr) {
  if (hr.firstName || hr.lastName) return { firstName: hr.firstName ?? '', lastName: hr.lastName ?? '' }
  const [first = '', ...rest] = hrName(hr).split(/\s+/)
  return { firstName: first, lastName: rest.join(' ') }
}

// Create / edit sheet for an attendance person. `person` null = create.
export function PersonSheet({ open, onOpenChange, person, lookups, canManage = true }) {
  const save = useSavePerson()
  const another = useCreateAnother()
  const [form, setForm] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [hrDraft, setHrDraft] = useState(null) // HR employee chosen while creating
  useEffect(() => {
    if (open) { setForm(person ? fromPerson(person) : EMPTY); setErrors({}); setHrDraft(null) }
    // Re-seed only when the sheet opens or targets another person (a refetch after linking HR must not wipe edits).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, person?.id])

  const set = (key) => (value) => setForm((f) => ({ ...f, [key]: value }))
  const setText = (key) => (event) => set(key)(event.target.value)

  // Choosing an HR suggestion fills the still-empty fields and remembers the link for save.
  function pickHr(hr) {
    const names = splitName(hr)
    setHrDraft(hr)
    setForm((f) => ({
      ...f,
      code: f.code.trim() ? f.code : (hr.employeeCode ?? ''),
      firstName: f.firstName.trim() ? f.firstName : names.firstName,
      lastName: f.lastName.trim() ? f.lastName : names.lastName,
      kind: /contract|extern|subcontrat/i.test(hr.employmentType ?? '') ? 'contractor' : 'internal',
    }))
  }

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
    if (!person && hrDraft) { payload.hrEmployeeId = hrDraft.id; payload.syncProfile = true }
    try {
      await save.mutateAsync(payload)
      another.finish({ close: () => onOpenChange(false), reset: () => { setForm(EMPTY); setErrors({}); setHrDraft(null) } })
    } catch { /* toast shown by the mutation */ }
  }

  return (
    <FormSheet
      open={open}
      onOpenChange={onOpenChange}
      title={person ? 'Editar persona' : 'Nueva persona'}
      description="Datos de la persona que registra entradas y salidas."
      createAnother={{ visible: !person, checked: another.checked, onChange: another.setChecked }}
      bodyRef={another.bodyRef}
      footer={(
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={submit} disabled={save.isPending}>{save.isPending ? 'Guardando…' : person ? 'Guardar' : 'Crear'}</Button>
        </>
      )}
    >
      <TextField label="Código de empleado" required value={form.code} onChange={setText('code')} error={errors.code} />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <TextField label="Nombres" required value={form.firstName} onChange={setText('firstName')} error={errors.firstName} />
        <TextField label="Apellidos" value={form.lastName} onChange={setText('lastName')} />
      </div>
      {!person ? (
        hrDraft
          ? <HrLinkedChip hr={hrDraft} onClear={() => setHrDraft(null)} />
          : <HrSuggestions query={`${form.firstName} ${form.lastName}`} onPick={pickHr} />
      ) : null}
      <SelectField label="Tipo" options={KIND_OPTIONS} value={form.kind} onValueChange={set('kind')} />
      <ComboboxField label="Grupo" options={toOptions(lookups.rows.groups)} value={form.groupId} onChange={set('groupId')} clearable placeholder="Sin grupo" />
      <ComboboxField label="Categoría" options={toOptions(lookups.rows.categories)} value={form.categoryId} onChange={set('categoryId')} clearable placeholder="Sin categoría" />
      <ComboboxField label="Turno" options={toOptions(lookups.rows.shifts)} value={form.shiftId} onChange={set('shiftId')} clearable placeholder="Sin turno" />
      <TextField
        label="PIN (4 a 8 dígitos)" type="password" inputMode="numeric" autoComplete="new-password" value={form.pin} onChange={setText('pin')} error={errors.pin}
        hint={person?.hasPin ? 'Ya tiene un PIN. Déjalo vacío para conservarlo.' : 'Opcional. Permite checar en un kiosko con PIN.'}
      />
      {person ? <SwitchField label="Activo" description="Las personas inactivas no pueden checar." checked={form.enabled} onChange={set('enabled')} /> : null}
      {person ? <HrLinkPanel person={person} canManage={canManage} /> : null}
    </FormSheet>
  )
}
