// Nuevo/Editar servicio: form state <-> API payload and the rules the page
// checks before saving. Same limits as the API validators.
export const EMPTY_SERVICE = {
  name: '', description: '', kind: 'appointment', durationMinutes: '60', bufferBeforeMinutes: '0', bufferAfterMinutes: '0',
  slotStepMinutes: '30', capacity: '10', minParty: '1', maxParty: '1', enabled: true, resourceIds: [],
}

export const serviceToForm = (s) => ({
  name: s.name, description: s.description ?? '', kind: s.kind, durationMinutes: String(s.durationMinutes), bufferBeforeMinutes: String(s.bufferBeforeMinutes),
  bufferAfterMinutes: String(s.bufferAfterMinutes), slotStepMinutes: String(s.slotStepMinutes), capacity: String(s.capacity), minParty: String(s.minParty),
  maxParty: String(s.maxParty), enabled: s.enabled, resourceIds: [...(s.resourceIds ?? [])],
})

const int = (v) => Number.parseInt(v, 10)

// Appointments occupy one of their resources; sessions get theirs when scheduled,
// so the engine does not require resources for them.
export const needsResource = (form) => form.kind === 'appointment'

export function validateService(form) {
  const errors = {}
  if (!form.name.trim()) errors.name = 'Escribe un nombre.'
  const range = (key, min, max, label) => { const v = int(form[key]); if (!(v >= min && v <= max)) errors[key] = `${label} entre ${min} y ${max}.` }
  range('durationMinutes', 1, 1440, 'Duración')
  range('bufferBeforeMinutes', 0, 720, 'Margen')
  range('bufferAfterMinutes', 0, 720, 'Margen')
  range('slotStepMinutes', 5, 1440, 'Intervalo')
  range('minParty', 1, 100000, 'Personas')
  range('maxParty', 1, 100000, 'Personas')
  if (form.kind === 'session') range('capacity', 1, 100000, 'Cupo')
  if (!errors.maxParty && !errors.minParty && int(form.maxParty) < int(form.minParty)) errors.maxParty = 'No puede ser menor al mínimo.'
  if (needsResource(form) && !form.resourceIds.length) errors.resources = 'Elige al menos un recurso: una cita ocupa a una persona, sala o equipo.'
  return errors
}

export function serviceToPayload(form, { editing }) {
  const session = form.kind === 'session'
  return {
    name: form.name.trim(), description: form.description.trim() || null,
    durationMinutes: int(form.durationMinutes), bufferBeforeMinutes: int(form.bufferBeforeMinutes), bufferAfterMinutes: int(form.bufferAfterMinutes),
    slotStepMinutes: int(form.slotStepMinutes), minParty: int(form.minParty), maxParty: int(form.maxParty),
    ...(session ? { capacity: int(form.capacity) } : {}),
    ...(editing ? { enabled: form.enabled } : { kind: form.kind }),
  }
}

// Minutes one booking blocks its resource: margins plus the service itself.
export function blockedMinutes(form) {
  const total = [form.durationMinutes, form.bufferBeforeMinutes, form.bufferAfterMinutes].map(int).reduce((a, b) => a + (Number.isFinite(b) ? b : 0), 0)
  return total > 0 ? total : null
}

export const sameForm = (a, b) => JSON.stringify({ ...a, resourceIds: [...a.resourceIds].sort() }) === JSON.stringify({ ...b, resourceIds: [...b.resourceIds].sort() })
