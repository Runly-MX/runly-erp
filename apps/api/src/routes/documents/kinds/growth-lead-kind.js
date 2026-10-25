// Document kind "growth.lead" (documento de un lead de Growth): flat tags for
// the lead, its attribution and contact, plus the list of form submissions.
// Growth fills it through hub.engine.generate({ kind, sourceId: leadId }).
import { DocumentProviderError } from "../document-errors.js";

export const GROWTH_LEAD_KIND = "growth.lead";

export const GROWTH_LEAD_SCHEMA = [
  { tag: "leadName", label: "Nombre", type: "text" },
  { tag: "leadEmail", label: "Correo", type: "text" },
  { tag: "leadPhone", label: "Teléfono", type: "text" },
  { tag: "leadCompany", label: "Empresa", type: "text" },
  { tag: "leadMessage", label: "Mensaje", type: "text" },
  { tag: "leadStatus", label: "Estado", type: "text" },
  { tag: "leadPriority", label: "Prioridad", type: "text" },
  { tag: "leadSource", label: "Origen", type: "text" },
  { tag: "firstSubmissionAt", label: "Primer envío", type: "date" },
  { tag: "lastSubmissionAt", label: "Último envío", type: "date" },
  { tag: "qualifiedAt", label: "Fecha de calificación", type: "date" },
  { tag: "convertedAt", label: "Fecha de conversión", type: "date" },
  { tag: "attributionSource", label: "Fuente", type: "text" },
  { tag: "attributionMedium", label: "Medio", type: "text" },
  { tag: "attributionCampaign", label: "Campaña", type: "text" },
  { tag: "contactName", label: "Contacto", type: "text" },
  { tag: "contactEmail", label: "Correo del contacto", type: "text" },
  { tag: "contactPhone", label: "Teléfono del contacto", type: "text" },
  { tag: "submissionCount", label: "Número de envíos", type: "number" },
  {
    tag: "submissions",
    label: "Envíos de formulario",
    type: "list",
    fields: [
      { tag: "formName", label: "Formulario", type: "text" },
      { tag: "submittedAt", label: "Fecha", type: "date" },
    ],
  },
];

// Normalized label (see normalizeLabel) -> tag, used to auto-tag company forms.
const LABELS = {
  nombre: "leadName", "nombre del lead": "leadName", cliente: "leadName", "nombre del cliente": "leadName",
  correo: "leadEmail", "correo electronico": "leadEmail", email: "leadEmail", "e mail": "leadEmail",
  telefono: "leadPhone", celular: "leadPhone", tel: "leadPhone",
  empresa: "leadCompany", compania: "leadCompany", "nombre de la empresa": "leadCompany",
  mensaje: "leadMessage", comentarios: "leadMessage",
  estado: "leadStatus", estatus: "leadStatus", prioridad: "leadPriority", origen: "leadSource",
  "primer envio": "firstSubmissionAt", "ultimo envio": "lastSubmissionAt",
  "fecha de calificacion": "qualifiedAt", "fecha de conversion": "convertedAt",
  fuente: "attributionSource", medio: "attributionMedium", campana: "attributionCampaign",
  contacto: "contactName", "correo del contacto": "contactEmail", "telefono del contacto": "contactPhone",
  "numero de envios": "submissionCount",
};

const SAMPLE = {
  leadName: "Ana Prospecto", leadEmail: "ana@example.com", leadPhone: "55 1234 5678", leadCompany: "Empresa de ejemplo",
  leadMessage: "Quiero más información.", leadStatus: "Nuevo", leadPriority: "Media", leadSource: "Formulario web",
  firstSubmissionAt: "15/01/2026", lastSubmissionAt: "20/01/2026", qualifiedAt: "", convertedAt: "",
  attributionSource: "google", attributionMedium: "cpc", attributionCampaign: "campaña-ejemplo",
  contactName: "Ana Prospecto", contactEmail: "ana@example.com", contactPhone: "55 1234 5678", submissionCount: "2",
  submissions: [
    { formName: "Contacto", submittedAt: "15/01/2026" },
    { formName: "Cotización", submittedAt: "20/01/2026" },
  ],
};

const leadSelect = {
  id: true, status: true, priority: true, name: true, email: true, phone: true, companyName: true, message: true,
  source: true, attribution: true, contactId: true, firstSubmissionAt: true, lastSubmissionAt: true, qualifiedAt: true, convertedAt: true,
};

export function createGrowthLeadDocumentKind({ prisma }) {
  return {
    key: GROWTH_LEAD_KIND,
    label: "Lead de Growth",
    permissionKey: "growth.leads.read",
    formats: ["docx", "xlsx", "pptx", "pdf"],
    schema: GROWTH_LEAD_SCHEMA,
    labels: LABELS,
    sampleData: SAMPLE,
    async load({ companyId, sourceId }) {
      const lead = await prisma.growthLead.findFirst({ where: { id: sourceId, companyId, enabled: true }, select: leadSelect });
      if (!lead) throw new DocumentProviderError("Lead no encontrado.", 404, "source_not_found");
      const contact = lead.contactId
        ? await prisma.contact.findFirst({
            where: { id: lead.contactId, companyId, enabled: true },
            select: { name: true, email: true, phone: true },
          })
        : null;
      const submissions = await prisma.websiteFormSubmission.findMany({
        where: { companyId, leadId: sourceId },
        orderBy: { submittedAt: "asc" },
        select: { submittedAt: true, form: { select: { name: true } } },
      });
      const attribution = lead.attribution && typeof lead.attribution === "object" ? lead.attribution : {};
      return {
        leadName: lead.name, leadEmail: lead.email, leadPhone: lead.phone, leadCompany: lead.companyName,
        leadMessage: lead.message, leadStatus: lead.status, leadPriority: lead.priority, leadSource: lead.source,
        firstSubmissionAt: lead.firstSubmissionAt, lastSubmissionAt: lead.lastSubmissionAt,
        qualifiedAt: lead.qualifiedAt, convertedAt: lead.convertedAt,
        attributionSource: attribution.source ?? "", attributionMedium: attribution.medium ?? "", attributionCampaign: attribution.campaign ?? "",
        contactName: contact?.name ?? "", contactEmail: contact?.email ?? "", contactPhone: contact?.phone ?? "",
        submissionCount: submissions.length,
        submissions: submissions.map((s) => ({ formName: s.form?.name ?? "", submittedAt: s.submittedAt })),
      };
    },
  };
}
