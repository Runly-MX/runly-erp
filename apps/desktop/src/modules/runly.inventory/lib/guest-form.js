// Supplier item form: schema, defaults and payload mapping. Only the fields the
// guest API accepts are ever sent (the API rejects anything else with FIELD_NOT_ALLOWED).
import { z } from 'zod'

export const NONE = '__none__'
const optionalText = (max) => z.string().trim().max(max, `Máximo ${max} caracteres`)

export const guestItemSchema = z.object({
  areaId: z.string().min(1, 'Elige una carpeta'),
  name: z.string().trim().min(1, 'Indica el nombre').max(255, 'Máximo 255 caracteres'),
  description: optionalText(2000),
  categoryId: z.string(),
  brandId: z.string(),
  locationId: z.string(),
  conditionId: z.string(),
  model: optionalText(255),
  partNumber: optionalText(255),
  serialNumber: optionalText(255),
  assetTag: optionalText(100),
  status: z.enum(['available', 'maintenance']),
  notes: optionalText(2000),
  // Keyed by custom field key (the shared custom-fields renderer binds by key); mapped to ids on submit.
  customValues: z.record(z.string(), z.any()),
})

const pick = (v) => (v && v !== NONE ? v : NONE)

export function guestItemDefaults(item, areaId, customFields = []) {
  const keyById = new Map(customFields.map((f) => [f.id, f.fieldKey]))
  const values = {}
  for (const cv of item?.customValues ?? []) {
    const key = keyById.get(cv.fieldId)
    if (key) values[key] = cv.value ?? ''
  }
  return {
    areaId: item?.areaId ?? areaId ?? '',
    name: item?.name ?? '',
    description: item?.description ?? '',
    categoryId: pick(item?.categoryId),
    brandId: pick(item?.brandId),
    locationId: pick(item?.locationId),
    conditionId: pick(item?.conditionId),
    model: item?.model ?? '',
    partNumber: item?.partNumber ?? '',
    serialNumber: item?.serialNumber ?? '',
    assetTag: item?.assetTag ?? '',
    status: item?.status === 'maintenance' ? 'maintenance' : 'available',
    notes: item?.notes ?? '',
    customValues: values,
  }
}

const blank = (v) => (v === '' || v === undefined ? null : v)

// Custom fields that apply to the chosen category (or to every category).
export function applicableCustomFields(customFields = [], categoryId) {
  const cat = categoryId && categoryId !== NONE ? categoryId : null
  return customFields.filter((f) => !f.categoryId || f.categoryId === cat)
}

// Creating sends areaId; editing never does (suppliers cannot move items).
// `statusEditable` false (assigned / retired items) leaves the admin-managed status untouched.
export function buildGuestPayload(values, { create, customFields = [], statusEditable = true }) {
  const applicable = applicableCustomFields(customFields, values.categoryId)
  const payload = {
    name: values.name.trim(),
    description: blank(values.description.trim()),
    categoryId: blank(values.categoryId === NONE ? '' : values.categoryId),
    brandId: blank(values.brandId === NONE ? '' : values.brandId),
    locationId: blank(values.locationId === NONE ? '' : values.locationId),
    conditionId: blank(values.conditionId === NONE ? '' : values.conditionId),
    model: blank(values.model.trim()),
    partNumber: blank(values.partNumber.trim()),
    serialNumber: blank(values.serialNumber.trim()),
    assetTag: blank(values.assetTag.trim()),
    notes: blank(values.notes.trim()),
    customValues: applicable
      .filter((f) => f.fieldKey in (values.customValues ?? {}))
      .map((f) => {
        const raw = values.customValues[f.fieldKey]
        return { fieldId: f.id, value: raw === null || raw === undefined ? null : blank(String(raw).trim()) }
      }),
  }
  if (statusEditable) payload.status = values.status
  return create ? { areaId: values.areaId, ...payload } : payload
}
