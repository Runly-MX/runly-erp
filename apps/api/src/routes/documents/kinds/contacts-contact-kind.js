// Document kind "contacts.contact" (documento de un contacto): cartas, fichas
// y formatos con los datos de un cliente, proveedor o persona.
import { DocumentProviderError } from "../document-errors.js";

export const CONTACTS_CONTACT_KIND = "contacts.contact";

export const CONTACTS_CONTACT_SCHEMA = [
  { tag: "contactName", label: "Nombre", type: "text" },
  { tag: "legalName", label: "Razón social", type: "text" },
  { tag: "contactType", label: "Tipo de contacto", type: "text" },
  { tag: "email", label: "Correo", type: "text" },
  { tag: "phone", label: "Teléfono", type: "text" },
  { tag: "taxId", label: "RFC", type: "text" },
  { tag: "website", label: "Sitio web", type: "text" },
  { tag: "industry", label: "Giro", type: "text" },
  { tag: "taxRegime", label: "Régimen fiscal", type: "text" },
  { tag: "fiscalPostalCode", label: "Código postal fiscal", type: "text" },
  { tag: "cfdiUse", label: "Uso de CFDI", type: "text" },
  { tag: "tags", label: "Etiquetas", type: "text" },
  { tag: "primaryAddress", label: "Domicilio principal", type: "text" },
  { tag: "primaryContactName", label: "Persona de contacto", type: "text" },
  {
    tag: "addresses", label: "Domicilios", type: "list",
    fields: [
      { tag: "label", label: "Nombre del domicilio", type: "text" },
      { tag: "address", label: "Domicilio", type: "text" },
      { tag: "postalCode", label: "Código postal", type: "text" },
      { tag: "city", label: "Ciudad", type: "text" },
      { tag: "state", label: "Estado", type: "text" },
    ],
  },
  {
    tag: "persons", label: "Personas de contacto", type: "list",
    fields: [
      { tag: "name", label: "Nombre", type: "text" },
      { tag: "role", label: "Cargo", type: "text" },
      { tag: "email", label: "Correo", type: "text" },
      { tag: "phone", label: "Teléfono", type: "text" },
    ],
  },
];

const LABELS = {
  nombre: "contactName", cliente: "contactName", proveedor: "contactName", "nombre del cliente": "contactName", "nombre del proveedor": "contactName",
  "razon social": "legalName", empresa: "legalName", tipo: "contactType", "tipo de contacto": "contactType",
  correo: "email", "correo electronico": "email", email: "email", telefono: "phone", celular: "phone",
  rfc: "taxId", "id fiscal": "taxId", "sitio web": "website", "pagina web": "website", giro: "industry",
  "regimen fiscal": "taxRegime", "codigo postal fiscal": "fiscalPostalCode", "uso de cfdi": "cfdiUse", "uso cfdi": "cfdiUse",
  etiquetas: "tags", domicilio: "primaryAddress", direccion: "primaryAddress", "domicilio principal": "primaryAddress",
  "persona de contacto": "primaryContactName", contacto: "primaryContactName",
};

const SAMPLE = {
  contactName: "Comercial Ejemplo", legalName: "Comercial Ejemplo SA de CV", contactType: "company", email: "contacto@example.com",
  phone: "55 1234 5678", taxId: "XAXX010101000", website: "https://example.com", industry: "Comercio", taxRegime: "601",
  fiscalPostalCode: "01000", cfdiUse: "G03", tags: "cliente, mayorista", primaryAddress: "Calle Ejemplo 123, Centro, CDMX",
  primaryContactName: "Ana Pérez",
  addresses: [{ label: "Fiscal", address: "Calle Ejemplo 123, Centro", postalCode: "01000", city: "CDMX", state: "CDMX" }],
  persons: [{ name: "Ana Pérez", role: "Compras", email: "ana@example.com", phone: "55 8765 4321" }],
};

const streetOf = (a) => [a.street, a.extNumber && `#${a.extNumber}`, a.intNumber && `Int. ${a.intNumber}`, a.neighborhood]
  .filter(Boolean).join(", ");

export function createContactsContactDocumentKind({ prisma }) {
  return {
    key: CONTACTS_CONTACT_KIND,
    label: "Contacto",
    moduleKey: "runly.contacts",
    permissionKey: "contacts.contacts.read",
    formats: ["docx", "xlsx", "pptx", "pdf"],
    schema: CONTACTS_CONTACT_SCHEMA,
    labels: LABELS,
    sampleData: SAMPLE,
    async load({ companyId, sourceId }) {
      const c = await prisma.contact.findFirst({
        where: { id: sourceId, companyId, enabled: true },
        select: {
          name: true, legalName: true, type: true, email: true, phone: true, taxId: true, website: true, industry: true,
          taxRegime: true, fiscalPostalCode: true, cfdiUse: true, tags: true,
          addresses: { orderBy: [{ isDefault: "desc" }, { sortOrder: "asc" }] },
          persons: { orderBy: [{ isPrimary: "desc" }, { sortOrder: "asc" }] },
        },
      });
      if (!c) throw new DocumentProviderError("Contacto no encontrado.", 404, "source_not_found");
      const addresses = (c.addresses ?? []).map((a) => ({
        label: a.label ?? "", address: streetOf(a), postalCode: a.postalCode ?? "", city: a.city ?? "", state: a.state ?? "",
      }));
      const persons = (c.persons ?? []).map((p) => ({ name: p.name, role: p.role ?? "", email: p.email ?? "", phone: p.phone ?? "" }));
      const first = addresses[0];
      return {
        contactName: c.name, legalName: c.legalName ?? "", contactType: c.type, email: c.email ?? "", phone: c.phone ?? "",
        taxId: c.taxId ?? "", website: c.website ?? "", industry: c.industry ?? "", taxRegime: c.taxRegime ?? "",
        fiscalPostalCode: c.fiscalPostalCode ?? "", cfdiUse: c.cfdiUse ?? "", tags: (c.tags ?? []).join(", "),
        primaryAddress: first ? [first.address, first.postalCode, first.city, first.state].filter(Boolean).join(", ") : "",
        primaryContactName: persons[0]?.name ?? "",
        addresses, persons,
      };
    },
  };
}
