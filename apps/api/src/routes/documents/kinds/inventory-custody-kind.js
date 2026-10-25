// Document kind "inventory.custody" (resguardo de inventario): the tag contract
// of services/document-templates/custody-template-data.js expressed as a kind
// schema, the custody label vocabulary used to auto-tag company forms, and the
// built-in default template. Inventory fills it through hub.engine.generate.
import {
  CUSTODY_CONFIG,
} from "../../../services/document-templates/docx-autotag.js";
import {
  CUSTODY_IMAGE_TAGS,
  CUSTODY_ITEM_TAGS,
  CUSTODY_SCALAR_TAGS,
  buildCustodyTemplateData,
  buildDefaultCustodyTemplate,
} from "../../../services/document-templates/custody-template-data.js";
import { DocumentProviderError } from "../document-errors.js";

export const INVENTORY_CUSTODY_KIND = "inventory.custody";

const SCALAR_LABELS = {
  folio: "Folio", date: "Fecha", kind: "Tipo (Entrega o Devolución)",
  receiverName: "Colaborador que recibe", receiverEmployeeNumber: "Número de empleado",
  receiverDepartment: "Departamento", receiverJobTitle: "Puesto", receiverEmail: "Correo del colaborador",
  delivererName: "Quien entrega", comments: "Comentarios",
  "company.name": "Empresa", "company.legalName": "Razón social", "company.taxId": "RFC de la empresa",
};
const ITEM_LABELS = {
  index: "No.", typeBrand: "Tipo / marca", model: "Modelo", serialNumber: "Número de serie",
  assetNumber: "Número de activo", invoiceNumber: "Factura", features: "Características",
};
const IMAGE_LABELS = { receiverSignature: "Firma de quien recibe", delivererSignature: "Firma de quien entrega" };

export const INVENTORY_CUSTODY_SCHEMA = [
  ...CUSTODY_SCALAR_TAGS.map((tag) => ({ tag, label: SCALAR_LABELS[tag] ?? tag, type: tag === "date" ? "date" : "text" })),
  {
    tag: "items",
    label: "Artículos del resguardo",
    type: "list",
    fields: CUSTODY_ITEM_TAGS.map((tag) => ({ tag, label: ITEM_LABELS[tag] ?? tag, type: "text" })),
  },
  ...CUSTODY_IMAGE_TAGS.map((tag) => ({ tag, label: IMAGE_LABELS[tag] ?? tag, type: "image" })),
];

const SAMPLE_CUSTODY = {
  folio: "RES-2026-0001",
  date: new Date(Date.UTC(2026, 0, 15)),
  kind: "DELIVERY",
  comments: "Equipo en buen estado.",
  delivererName: "Ana Entrega",
  employee: { firstName: "Luis", lastName: "Recibe", employeeCode: "E-100", workEmail: "luis@example.com", department: "Operaciones", jobTitle: "Analista" },
  items: [
    { typeBrand: "Laptop Marca", model: "Modelo X", serialNumber: "SN-001", assetTag: "A-001", invoiceNumber: "F-10", features: "16 GB RAM" },
    { typeBrand: "Monitor Marca", model: "Modelo Y", serialNumber: "SN-002", assetTag: "A-002", invoiceNumber: "F-10", features: "24 pulgadas" },
  ],
};

const CUSTODY_INCLUDE = {
  items: { orderBy: { sortOrder: "asc" } },
  employee: {
    select: {
      firstName: true, lastName: true, employeeCode: true, workEmail: true, personalEmail: true,
      department: true, jobTitle: true, departmentRef: { select: { name: true } }, jobTitleRef: { select: { name: true } },
    },
  },
  deliverer: { select: { displayName: true, firstName: true, lastName: true } },
};

export function createInventoryCustodyDocumentKind({ prisma }) {
  return {
    key: INVENTORY_CUSTODY_KIND,
    label: "Resguardo de inventario",
    permissionKey: "inventory.custody.read",
    managePermissionKey: "inventory.template.manage",
    formats: ["docx", "xlsx", "pptx", "pdf"],
    schema: INVENTORY_CUSTODY_SCHEMA,
    // Same vocabulary the inventory auto-tagger always used.
    labels: CUSTODY_CONFIG.labels,
    itemColumns: CUSTODY_CONFIG.itemColumns,
    signatures: CUSTODY_CONFIG.signatures,
    sampleData: buildCustodyTemplateData({ custody: SAMPLE_CUSTODY, company: { name: "Empresa de ejemplo", legalName: "Empresa de Ejemplo SA de CV", rfc: "XAXX010101000" } }),
    defaultTemplate: async () => ({ format: "docx", buffer: buildDefaultCustodyTemplate() }),
    // Data only (signatures are images supplied by the caller that owns them).
    async load({ companyId, sourceId }) {
      const custody = await prisma.invCustody.findFirst({ where: { id: sourceId, companyId }, include: CUSTODY_INCLUDE });
      if (!custody) throw new DocumentProviderError("Resguardo no encontrado.", 404, "source_not_found");
      const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, legalName: true, rfc: true } });
      return buildCustodyTemplateData({ custody, company });
    },
  };
}
