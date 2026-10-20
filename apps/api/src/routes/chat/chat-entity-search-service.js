import { createUserAccessService } from "../../services/user-access-service.js";
import { createInventoryAccess } from "../../services/inventory-access.js";
import { scopeWhere } from "../../services/inventory-scope.js";
import { createChatExtraEntityTypes, EXTRA_REFERENCE_PERMISSIONS } from "./chat-entity-extra-types.js";

// Server-side search for the chat connectors ("+" picker and the
// /module:query shortcuts). Each type searches the attributes people actually
// remember a record by (serial number, folio, RFC, plate, order number...)
// instead of filtering a capped first page in the browser.
export const SEARCHABLE_TYPES = [
  "contact", "hr_employee", "inventory_item", "vehicle",
  "purchase_case", "purchase_order", "purchase_invoice", "pos_order",
];

const PERMISSIONS = {
  contact: "contacts.contacts.read",
  hr_employee: "hr.employee.read",
  inventory_item: "inventory.item.read",
  vehicle: "fleet.vehicles.read",
  ...EXTRA_REFERENCE_PERMISSIONS,
};

const words = (q) => String(q ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 5);
const anyOf = (fields, word) => ({ OR: fields.map((field) => ({ [field]: { contains: word, mode: "insensitive" } })) });
const allWords = (q, fields) => (words(q).length ? { AND: words(q).map((word) => anyOf(fields, word)) } : {});

export function createChatEntitySearchService({ prisma, fleetService, inventoryAccess = createInventoryAccess({ prisma }) }) {
  const access = createUserAccessService({ prisma });
  const extra = createChatExtraEntityTypes({ prisma });

  async function searchOne(entityType, companyId, q, limit, profileId) {
    if (entityType === "contact") {
      const rows = await prisma.contact.findMany({
        where: { companyId, enabled: true, ...allWords(q, ["name", "legalName", "email", "phone", "taxId", "industry"]) },
        orderBy: { name: "asc" }, take: limit,
        select: { id: true, name: true, email: true, phone: true, taxId: true, avatarFileId: true },
      });
      return rows.map((r) => ({
        entityType, recordId: r.id, label: r.name,
        subtitle: [r.phone, r.email, r.taxId].filter(Boolean).join(" · ") || null, avatarFileId: r.avatarFileId ?? null,
      }));
    }
    if (entityType === "hr_employee") {
      const rows = await prisma.hrEmployee.findMany({
        where: { companyId, enabled: true, ...allWords(q, ["firstName", "lastName", "employeeCode", "workEmail", "phone", "jobTitle", "department"]) },
        orderBy: { firstName: "asc" }, take: limit,
        select: { id: true, firstName: true, lastName: true, jobTitle: true, department: true, employeeCode: true },
      });
      return rows.map((r) => ({
        entityType, recordId: r.id, label: `${r.firstName} ${r.lastName}`.trim(),
        subtitle: [r.employeeCode, r.jobTitle ?? r.department].filter(Boolean).join(" · ") || null,
      }));
    }
    if (entityType === "inventory_item") {
      const fields = ["name", "assetTag", "folio", "serialNumber", "model", "partNumber", "vendorName", "invoiceNumber", "description", "notes"];
      // Area scoping: items outside the actor's areas never show up in the picker.
      const restriction = scopeWhere(await inventoryAccess.scopeFor({ companyId, actorId: profileId }));
      const where = words(q).length
        ? { companyId, enabled: true, ...(restriction ?? {}), AND: words(q).map((word) => ({ OR: [
          ...fields.map((field) => ({ [field]: { contains: word, mode: "insensitive" } })),
          { brand: { name: { contains: word, mode: "insensitive" } } },
          { category: { name: { contains: word, mode: "insensitive" } } },
          { location: { name: { contains: word, mode: "insensitive" } } },
          { customValues: { some: { value: { contains: word, mode: "insensitive" } } } },
        ] })) }
        : { companyId, enabled: true, ...(restriction ?? {}) };
      const rows = await prisma.invItem.findMany({
        where, orderBy: { updatedAt: "desc" }, take: limit,
        select: { id: true, name: true, assetTag: true, serialNumber: true, status: true, category: { select: { name: true } }, brand: { select: { name: true } } },
      });
      return rows.map((r) => ({
        entityType, recordId: r.id, label: r.name,
        subtitle: [r.assetTag, r.serialNumber ? `S/N ${r.serialNumber}` : null, r.brand?.name, r.category?.name].filter(Boolean).join(" · ") || null,
        status: r.status ?? null, statusBadgeType: "inventory_item",
      }));
    }
    if (entityType === "vehicle") {
      const result = await fleetService.listVehicles({ companyId, page: 1, pageSize: limit, search: q || undefined });
      return (result?.data ?? []).map((v) => ({
        entityType, recordId: v.id, label: v.plate || v.name || "Vehículo",
        subtitle: [v.vehicle_brand_name, v.vehicle_model_name, v.vehicle_model_year].filter(Boolean).join(" ") || null,
        status: v.status ?? null, statusBadgeType: "vehicle", coverImageFileId: v.cover_image_file_asset_id ?? null,
      }));
    }
    return extra.search(entityType, companyId, q, limit);
  }

  // One type per call keeps the permission check and the payload simple;
  // the client fans out for "Todos".
  async function search({ authUserId, companyId, entityType, q = "", limit = 15 }) {
    const permission = PERMISSIONS[entityType];
    if (!permission || !companyId) return [];
    const profile = await prisma.userProfile.findUnique({ where: { authUserId }, select: { id: true } });
    if (!profile) return [];
    await access.assertCompanyMember(companyId, profile.id, permission);
    return searchOne(entityType, companyId, String(q).slice(0, 120), Math.min(Math.max(Number(limit) || 15, 1), 30), profile.id);
  }

  return { search, SEARCHABLE_TYPES };
}
