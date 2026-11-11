import { createWebsiteFormScopeService } from './website-form-scope-service.js'

// Templates cannot know a form id, so a ContactFormBlock whose `formId` is a placeholder asks the apply step to provide
// one: it reuses the site's form with that name or creates it in the same transaction.
export const CONTACT_FORM_PLACEHOLDER = '@contact'
export const NEWSLETTER_FORM_PLACEHOLDER = '@newsletter'

const field = (label, name, fieldType, semanticKey, placeholder) => ({ label, name, fieldType, semanticKey, required: true, placeholder })
export const FORM_PLACEHOLDERS = {
  [CONTACT_FORM_PLACEHOLDER]: {
    name: 'Contacto', submitLabel: 'Enviar mensaje', successMessage: 'Gracias, te responderemos muy pronto.',
    fields: [field('Nombre', 'nombre', 'text', 'name', 'Tu nombre'), field('Correo', 'correo', 'email', 'email', 'tu@correo.com'), field('Mensaje', 'mensaje', 'textarea', 'message', 'Cuéntanos qué necesitas')],
  },
  [NEWSLETTER_FORM_PLACEHOLDER]: {
    name: 'Newsletter', submitLabel: 'Suscribirme', successMessage: 'Gracias por suscribirte.',
    fields: [field('Correo', 'correo', 'email', 'email', 'tu@correo.com')],
  },
}

const isPlaceholder = (block) => block?.type === 'ContactFormBlock' && Object.hasOwn(FORM_PLACEHOLDERS, block.props?.formId)

// Distinct placeholders present in the document, e.g. ['@contact', '@newsletter'].
export const placeholdersIn = (document) => [...new Set(Object.values(document?.blocks ?? {}).filter(isPlaceholder).map((b) => b.props.formId))]

export const usesContactForm = (document) => placeholdersIn(document).length > 0

// `forms` maps placeholder -> form id (null/missing when none could be created). Blocks without a form are removed so
// the page never carries a form that cannot publish. A plain string id keeps the old single-form call working.
export function bindContactForm(document, forms) {
  const ids = !forms || typeof forms === 'string' ? Object.fromEntries(Object.keys(FORM_PLACEHOLDERS).map((k) => [k, forms || null])) : forms
  const blocks = Object.values(document?.blocks ?? {}).filter(isPlaceholder)
  for (const block of blocks) {
    const formId = ids[block.props.formId]
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

// Must run inside the apply transaction (`tx`), so a failed apply leaves no orphan form.
export async function ensureTemplateForm({ tx, companyId, siteId, placeholder = CONTACT_FORM_PLACEHOLDER, createsLead = true }) {
  const def = FORM_PLACEHOLDERS[placeholder]
  const existing = createsLead ? await tx.websiteForm.findFirst({ where: { companyId, siteId, name: def.name, enabled: true }, select: { id: true } }) : null
  if (existing) return existing.id
  const form = await tx.websiteForm.create({ data: { companyId, siteId, name: def.name, submitLabel: def.submitLabel, successMessage: def.successMessage, createsLead, honeypotEnabled: true, turnstileRequired: false, wizardMode: false } })
  await createWebsiteFormScopeService({ prisma: tx }).provision({ companyId, formId: form.id, ownerKind: 'website', ownerId: siteId, allowAmbiguous: true, newForm: true, db: tx })
  await tx.websiteFormField.createMany({ data: def.fields.map((f, index) => ({ companyId, formId: form.id, ...f, options: null, sortOrder: index, stepNumber: 1, stepTitle: null })) })
  return form.id
}

export const ensureContactForm = (args) => ensureTemplateForm({ ...args, placeholder: CONTACT_FORM_PLACEHOLDER })
