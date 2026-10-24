export class FieldServiceError extends Error {
  constructor(message, status = 500) {
    super(message)
    this.name = 'FieldServiceError'
    this.status = status
  }
}

const VALID_KINDS = ['TEXT', 'NUMBER', 'DATE', 'SELECT', 'CHECKBOX', 'USER']
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// Returns the normalized string to store, or throws FieldServiceError. Values
// stay strings in storage; the kind decides what is accepted.
export function normalizeFieldValue(field, value) {
  const raw = String(value).trim()
  const bad = (msg) => { throw new FieldServiceError(`${field.name}: ${msg}`, 400) }
  switch (field.kind) {
    case 'NUMBER':
      if (raw === '' || !Number.isFinite(Number(raw))) bad('debe ser un numero.')
      return String(Number(raw))
    case 'DATE':
      if (!/^\d{4}-\d{2}-\d{2}/.test(raw) || Number.isNaN(Date.parse(raw))) bad('debe ser una fecha valida.')
      return raw
    case 'SELECT': {
      const options = Array.isArray(field.options) ? field.options.map((o) => (typeof o === 'object' ? (o.value ?? o.label) : o)) : []
      if (!options.map(String).includes(raw)) bad('opcion no permitida.')
      return raw
    }
    case 'CHECKBOX':
      if (raw !== 'true' && raw !== 'false') bad('debe ser verdadero o falso.')
      return raw
    case 'USER':
      if (!UUID_RE.test(raw)) bad('usuario invalido.')
      return raw
    default:
      return raw
  }
}

export function createFieldsService({ prisma }) {
  // ── Project fields ──────────────────────────────────────────────────────────

  async function listFields(projectId) {
    return prisma.projectField.findMany({
      where: { projectId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    })
  }

  async function createField(projectId, { name, kind, options, position }) {
    if (!name?.trim()) throw new FieldServiceError('El nombre del campo es requerido.', 400)
    if (!VALID_KINDS.includes(kind)) {
      throw new FieldServiceError(`Tipo de campo invalido. Valores permitidos: ${VALID_KINDS.join(', ')}.`, 400)
    }
    if (kind === 'SELECT' && (!Array.isArray(options) || options.length === 0)) {
      throw new FieldServiceError('Los campos SELECT requieren al menos una opcion.', 400)
    }
    const existing = await prisma.projectField.count({ where: { projectId } })
    return prisma.projectField.create({
      data: {
        projectId,
        name: name.trim(),
        kind,
        options: kind === 'SELECT' ? options : null,
        position: position ?? existing,
      },
    })
  }

  async function updateField(fieldId, projectId, { name, options, position }) {
    const field = await prisma.projectField.findFirst({ where: { id: fieldId, projectId } })
    if (!field) throw new FieldServiceError('Campo no encontrado.', 404)
    return prisma.projectField.update({
      where: { id: fieldId },
      data: {
        ...(name?.trim() ? { name: name.trim() } : {}),
        ...(options !== undefined ? { options } : {}),
        ...(position !== undefined ? { position } : {}),
      },
    })
  }

  async function deleteField(fieldId, projectId) {
    const field = await prisma.projectField.findFirst({ where: { id: fieldId, projectId } })
    if (!field) throw new FieldServiceError('Campo no encontrado.', 404)
    await prisma.taskFieldValue.deleteMany({ where: { fieldId } })
    await prisma.projectField.delete({ where: { id: fieldId } })
    return field
  }

  // ── Task field values ───────────────────────────────────────────────────────

  async function getFieldValues(taskId, projectId) {
    const fields = await prisma.projectField.findMany({
      where: { projectId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    })
    const values = await prisma.taskFieldValue.findMany({ where: { taskId } })
    const valueMap = new Map(values.map((v) => [v.fieldId, v.value]))
    return fields.map((f) => ({ field: f, value: valueMap.get(f.id) ?? null }))
  }

  async function upsertFieldValues(taskId, projectId, entries) {
    // entries: [{ fieldId, value }]
    const fieldIds = entries.map((e) => e.fieldId)
    const owned = await prisma.projectField.findMany({
      where: { id: { in: fieldIds }, projectId },
    })
    const fieldById = new Map(owned.map((f) => [f.id, f]))
    const validEntries = entries
      .filter((e) => fieldById.has(e.fieldId))
      .map((e) => (e.value === null || e.value === ''
        ? e
        : { ...e, value: normalizeFieldValue(fieldById.get(e.fieldId), e.value) }))
    const userEntries = validEntries.filter((e) => e.value !== null && e.value !== '' && fieldById.get(e.fieldId).kind === 'USER')
    for (const e of userEntries) {
      const member = await prisma.projectMember.findFirst({ where: { projectId, userId: e.value }, select: { id: true } })
      if (!member) throw new FieldServiceError(`${fieldById.get(e.fieldId).name}: el usuario no es miembro del proyecto.`, 400)
    }

    await Promise.all(
      validEntries.map(({ fieldId, value }) =>
        value === null || value === ''
          ? prisma.taskFieldValue.deleteMany({ where: { taskId, fieldId } })
          : prisma.taskFieldValue.upsert({
              where: { taskId_fieldId: { taskId, fieldId } },
              create: { taskId, fieldId, value: String(value) },
              update: { value: String(value) },
            })
      )
    )
    return getFieldValues(taskId, projectId)
  }

  return { listFields, createField, updateField, deleteField, getFieldValues, upsertFieldValues }
}
