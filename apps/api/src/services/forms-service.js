import { WebsiteServiceError } from '../routes/website/service-helpers.js';
import { secureWebsiteMethods } from './website-authorization-service.js';
import { createFormSchema, updateFormSchema, createFormFieldSchema, updateFormFieldSchema, reorderFieldsSchema } from '@runly/validators';

export class FormsServiceError extends WebsiteServiceError {
  constructor(message, status = 500, code = 'forms_error') {
    super(message, status, code);
    this.name = "FormsServiceError";
    this.status = status;
  }
}

function notFound(entity) {
  return new FormsServiceError(`${entity} no encontrado.`, 404, 'resource_not_found');
}

export function createFormsService({ prisma, ownerDomain = 'website' }) {
  if (!['website', 'growth'].includes(ownerDomain)) throw new Error('Invalid form owner domain');
  async function assertOwner(companyId, siteId) {
    if (!siteId) throw notFound('Recurso');
    const [site, property] = await Promise.all([
      prisma.websiteSite.findFirst({ where: { id: siteId, companyId, enabled: true } }),
      prisma.growthProperty.findFirst({ where: { id: siteId, companyId, enabled: true } }),
    ]);
    if (site && property) throw new WebsiteServiceError('La referencia histórica requiere revisión.', 409, 'ambiguous_site_identifier');
    const parent = ownerDomain === 'website' ? site : property;
    if (!parent) throw notFound('Recurso');
    if (property?.websiteSiteId) {
      const linked = await prisma.websiteSite.findFirst({ where: { id: property.websiteSiteId, companyId, enabled: true } });
      if (!linked) throw notFound('Recurso');
    }
  }
  async function scopedForm(companyId, formId) {
    const form = await prisma.websiteForm.findFirst({ where: { id: formId, companyId, enabled: true } });
    if (!form) throw notFound('Recurso');
    await assertOwner(companyId, form.siteId);
    return form;
  }
  function validate(schema, args, siteId) {
    if (args.data?.siteId !== undefined && args.data.siteId !== siteId) throw notFound('Recurso');
    const result = schema.strict().safeParse(siteId ? { ...args.data, siteId } : args.data);
    if (!result.success) throw new WebsiteServiceError('Datos inválidos.', 422, 'validation_failed');
    args.data = result.data;
  }
  async function before(name, args) {
    const { companyId } = args;
    const requiredIds = { getForm: 'formId', updateForm: 'formId', softDeleteForm: 'formId', createFormField: 'formId', reorderFormFields: 'formId', listSubmissions: 'formId', deleteSubmission: 'formId', updateFormField: 'fieldId', softDeleteFormField: 'fieldId' };
    if (requiredIds[name] && !args[requiredIds[name]]) throw notFound('Recurso');
    if (name === 'listForms' || name === 'createForm') await assertOwner(companyId, args.siteId);
    if (name === 'createForm') validate(createFormSchema, args, args.siteId);
    if (name === 'updateForm') validate(updateFormSchema, args);
    if (name === 'createFormField') validate(createFormFieldSchema, args);
    if (name === 'updateFormField') validate(updateFormFieldSchema, args);
    if (args.formId) await scopedForm(companyId, args.formId);
    if (args.fieldId) {
      const field = await prisma.websiteFormField.findFirst({ where: { id: args.fieldId, companyId, enabled: true } });
      if (!field) throw notFound('Recurso');
      if (args.formId && field.formId !== args.formId) throw notFound('Recurso');
      await scopedForm(companyId, field.formId);
    }
    if (name === 'reorderFormFields') {
      const parsed = reorderFieldsSchema.strict().safeParse({ items: args.items });
      if (!parsed.success) throw new WebsiteServiceError('Datos inválidos.', 422, 'validation_failed');
      args.items = parsed.data.items;
      if (!args.formId || !Array.isArray(args.items) || new Set(args.items.map(item => item.id)).size !== args.items.length) throw notFound('Recurso');
      for (const item of args.items) {
        const field = await prisma.websiteFormField.findFirst({ where: { id: item.id, companyId, formId: args.formId, enabled: true } });
        if (!field) throw notFound('Recurso');
      }
    }
    if (name === 'deleteSubmission') {
      if (!args.formId) throw notFound('Recurso');
      const submission = await prisma.websiteFormSubmission.findFirst({ where: { id: args.submissionId, companyId, formId: args.formId } });
      if (!submission) throw notFound('Recurso');
    }
  }
  async function assertFormAssignee({ companyId, userId }) {
    if (!userId) return;
    const membership = await prisma.membership.findFirst({
      where: {
        companyId,
        userId,
        enabled: true,
        user: { enabled: true },
      },
      select: { id: true },
    });
    if (!membership) {
      throw new FormsServiceError(
        "El responsable debe ser un usuario activo de la empresa.",
        422,
      );
    }
  }

  async function listForms({ companyId, siteId }) {
    return prisma.websiteForm.findMany({
      where: { companyId, siteId, enabled: true },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { fields: { where: { companyId } }, submissions: { where: { companyId } } } } },
    });
  }

  async function getForm({ companyId, formId }) {
    const form = await prisma.websiteForm.findFirst({
      where: { id: formId, companyId, enabled: true },
      include: { fields: { where: { enabled: true, companyId }, orderBy: { sortOrder: "asc" } } },
    });
    if (!form) throw notFound("Formulario");
    return form;
  }

  async function createForm({ companyId, siteId, data }) {
    await assertFormAssignee({ companyId, userId: data.defaultAssigneeUserId });
    return prisma.websiteForm.create({
      data: {
        companyId,
        siteId,
        name: data.name,
        description: data.description ?? null,
        submitLabel: data.submitLabel ?? "Enviar",
        successMessage: data.successMessage ?? null,
        notifyEmail: data.notifyEmail ?? null,
        createsLead: data.createsLead ?? true,
        defaultAssigneeUserId: data.defaultAssigneeUserId ?? null,
        honeypotEnabled: data.honeypotEnabled ?? true,
        turnstileRequired: data.turnstileRequired ?? false,
        wizardMode: data.wizardMode ?? false,
      },
    });
  }

  async function updateForm({ companyId, formId, data }) {
    const form = await prisma.websiteForm.findFirst({ where: { id: formId, companyId } });
    if (!form) throw notFound("Formulario");
    await assertFormAssignee({ companyId, userId: data.defaultAssigneeUserId });
    return prisma.websiteForm.update({ where: { id: formId, companyId, siteId: form.siteId }, data });
  }

  async function listFormAssignees({ companyId }) {
    const memberships = await prisma.membership.findMany({
      where: { companyId, enabled: true, user: { enabled: true } },
      orderBy: { user: { displayName: "asc" } },
      select: { user: { select: { id: true, displayName: true, email: true } } },
    });
    return memberships.map((membership) => membership.user);
  }

  async function softDeleteForm({ companyId, formId }) {
    const form = await prisma.websiteForm.findFirst({ where: { id: formId, companyId } });
    if (!form) throw notFound("Formulario");
    return prisma.websiteForm.update({ where: { id: formId, companyId, siteId: form.siteId }, data: { enabled: false } });
  }

  async function createFormField({ companyId, formId, data }) {
    const form = await prisma.websiteForm.findFirst({ where: { id: formId, companyId } });
    if (!form) throw notFound("Formulario");
    return prisma.websiteFormField.create({
      data: {
        companyId,
        formId,
        label: data.label,
        name: data.name,
        fieldType: data.fieldType ?? "text",
        semanticKey: data.semanticKey ?? "custom",
        placeholder: data.placeholder ?? null,
        required: data.required ?? false,
        options: data.options ?? null,
        sortOrder: data.sortOrder ?? 0,
        stepNumber: data.stepNumber ?? 1,
        stepTitle: data.stepTitle ?? null,
      },
    });
  }

  async function updateFormField({ companyId, fieldId, data }) {
    const field = await prisma.websiteFormField.findFirst({ where: { id: fieldId, companyId } });
    if (!field) throw notFound("Campo");
    return prisma.websiteFormField.update({ where: { id: fieldId, companyId, formId: field.formId }, data });
  }

  async function softDeleteFormField({ companyId, fieldId }) {
    const field = await prisma.websiteFormField.findFirst({ where: { id: fieldId, companyId } });
    if (!field) throw notFound("Campo");
    return prisma.websiteFormField.update({ where: { id: fieldId, companyId, formId: field.formId }, data: { enabled: false } });
  }

  async function reorderFormFields({ companyId, formId, items }) {
    return prisma.$transaction(
      items.map(({ id, sortOrder }) =>
        prisma.websiteFormField.update({ where: { id, companyId, formId }, data: { sortOrder } }),
      ),
    );
  }

  async function listSubmissions({ companyId, formId, actorId, page = 1, pageSize = 20 }) {
    const skip = (page - 1) * pageSize;
    const where = { formId, companyId };
    const [data, total] = await Promise.all([
      prisma.websiteFormSubmission.findMany({ where, orderBy: { submittedAt: "desc" }, skip, take: pageSize }),
      prisma.websiteFormSubmission.count({ where }),
    ]);
    await prisma.auditLog.create({ data: { actorId, moduleKey: ownerDomain === 'website' ? 'runly.website' : 'runly.growth', entityType: 'website.form', entityId: formId, action: 'form.submissions.read', metadata: { companyId, count: data.length } } });
    return { data, total, page, pageSize };
  }

  async function deleteSubmission() {
    throw new WebsiteServiceError('Las respuestas se conservan; su eliminación requiere una política de retención aprobada.', 409, 'retention_required');
  }

  const permissions = {
    listForms: 'read', getForm: 'read', createForm: 'create', updateForm: 'update', softDeleteForm: 'delete',
    createFormField: 'update', updateFormField: 'update', softDeleteFormField: 'update', reorderFormFields: 'update',
    listSubmissions: 'read', deleteSubmission: 'delete', listFormAssignees: 'read',
  };
  const mapped = Object.fromEntries(Object.entries(permissions).map(([name, action]) => [name, `${ownerDomain}.forms.${action}`]));
  if (ownerDomain === 'website') {
    mapped.listSubmissions = 'website.submissions.read';
    mapped.deleteSubmission = 'website.submissions.delete';
    mapped.listFormAssignees = 'website.site.update';
  }
  return secureWebsiteMethods({
    listForms,
    getForm,
    createForm,
    updateForm,
    listFormAssignees,
    softDeleteForm,
    createFormField,
    updateFormField,
    softDeleteFormField,
    reorderFormFields,
    listSubmissions,
    deleteSubmission,
  }, mapped, before);
}
