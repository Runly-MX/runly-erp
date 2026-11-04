import { createWebsiteFormScopeService } from './website-form-scope-service.js'

// Templates cannot know a form id, so a ContactFormBlock with this placeholder in `formId` asks the apply step to
// provide one: it reuses the site's "Contacto" form or creates it (name, email, message) in the same transaction.
export const CONTACT_FORM_PLACEHOLDER = '@contact'
const FORM_NAME = 'Contacto'

const isPlaceholder = (block) => block?.type === 'ContactFormBlock' && block.props?.formId === CONTACT_FORM_PLACEHOLDER

export const usesContactForm = (document) => Object.values(document?.blocks ?? {}).some(isPlaceholder)

// Sets the form id on every placeholder block; without a form (no permission to create one) the blocks are removed so
// the page never carries a form that cannot publish.
export function bindContactForm(document, formId) {
  const blocks = Object.values(document?.blocks ?? {}).filter(isPlaceholder)
  for (const block of blocks) {
    if (formId) { block.props.formId = formId; continue }
    delete document.blocks[block.id]
    for (const region of Object.values(document.regions ?? {})) region.children = (region.children ?? []).filter((id) => id !== block.id)
    for (const parent of Object.values(document.blocks)) {
      for (const [slot, value] of Object.entries(parent.children ?? {})) {
        if (Array.isArray(value)) parent.children[slot] = value.filter((id) => id !== block.id)
        else if (Array.isArray(value?.children)) value.children = value.children.filter((id) => id !== block.id)
      }
    }
  }
  return document
}

const FIELDS = [
  { label: 'Nombre', name: 'nombre', fieldType: 'text', semanticKey: 'name', required: true, placeholder: 'Tu nombre' },
  { label: 'Correo', name: 'correo', fieldType: 'email', semanticKey: 'email', required: true, placeholder: 'tu@correo.com' },
  { label: 'Mensaje', name: 'mensaje', fieldType: 'textarea', semanticKey: 'message', required: true, placeholder: 'Cuéntanos qué necesitas' },
]

// Must run inside the apply transaction (`tx`), so a failed apply leaves no orphan form.
export async function ensureContactForm({ tx, companyId, siteId }) {
  const existing = await tx.websiteForm.findFirst({ where: { companyId, siteId, name: FORM_NAME, enabled: true }, select: { id: true } })
  if (existing) return existing.id
  const form = await tx.websiteForm.create({ data: { companyId, siteId, name: FORM_NAME, submitLabel: 'Enviar mensaje', successMessage: 'Gracias, te responderemos muy pronto.', createsLead: true, honeypotEnabled: true, turnstileRequired: false, wizardMode: false } })
  await createWebsiteFormScopeService({ prisma: tx }).provision({ companyId, formId: form.id, ownerKind: 'website', ownerId: siteId, allowAmbiguous: true, newForm: true, db: tx })
  await tx.websiteFormField.createMany({ data: FIELDS.map((field, index) => ({ companyId, formId: form.id, ...field, options: null, sortOrder: index, stepNumber: 1, stepTitle: null })) })
  return form.id
}
