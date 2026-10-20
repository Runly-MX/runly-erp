// runly.inventory: deep multi-source search (own columns, assignments, comments,
// purchases, custody, files, custom fields) via inventory-search-service.
import { Prisma } from "@prisma/client";
import { createInventorySearch } from "../inventory-search-service.js";
import { createInventoryAccess } from "../inventory-access.js";
import { scopeSql } from "../inventory-scope.js";
import { tokenizeSearch, normalizeSearchText } from "../../lib/search-tokens.js";
import { defineProvider, joinParts, fullName, safeTitle, enc } from "./helpers.js";

const MAX_IDS = 500;

export const inventoryProvider = defineProvider({
  source: "inventory",
  moduleKey: "runly.inventory",
  label: "Inventario",
  permission: "inventory.item.read",
  icon: "Boxes",
  target: (id) => `/app/m/runly.inventory/inventory/${id}`,
  seeAllTarget: (q) => `/app/m/runly.inventory/inventory?search=${enc(q)}`,
  async search({ prisma, companyId, actorId, q, limit, inventoryAccess = createInventoryAccess({ prisma }) }) {
    const tokens = tokenizeSearch(q);
    if (!tokens.length) return { items: [], total: 0 };
    // Area scoping: null = unrestricted. Fails closed (the provider is dropped) without a resolvable actor.
    const scope = await inventoryAccess.scopeFor({ companyId, actorId });
    const found = await createInventorySearch({ prisma }).searchItemIds(companyId, q, { limit: MAX_IDS });
    if (!found.length) return { items: [], total: 0 };
    const ids = !scope.all
      ? (await prisma.$queryRaw(Prisma.sql`SELECT id FROM inv_item WHERE company_id = ${companyId}::uuid AND id = ANY(${found}::uuid[]) AND ${scopeSql(scope)}`)).map((row) => row.id)
      : found;
    if (!ids.length) return { items: [], total: 0 };
    const exact = normalizeSearchText(q);
    const rows = await prisma.$queryRaw(Prisma.sql`
      SELECT i.id, i.name, i.serial_number, i.asset_tag, i.model, i.part_number, e.first_name, e.last_name
      FROM inv_item i LEFT JOIN hr_employee e ON e.id = i.assigned_to_id
      WHERE i.company_id = ${companyId}::uuid AND i.enabled = true AND i.id = ANY(${ids}::uuid[])
      ORDER BY
        CASE WHEN atlas_unaccent(lower(coalesce(i.serial_number, ''))) = ${exact}
              OR atlas_unaccent(lower(coalesce(i.asset_tag, ''))) = ${exact} THEN 0 ELSE 1 END,
        i.name ASC
      LIMIT ${Number(limit) || 5}`);
    const items = rows.map((r) => {
      const own = normalizeSearchText([r.name, r.serial_number, r.asset_tag, r.model, r.part_number, r.first_name, r.last_name].join(" "));
      const outside = tokens.some((t) => !own.includes(t));
      const assignee = fullName(r.first_name, r.last_name);
      return {
        id: r.id,
        title: safeTitle("Equipo sin nombre", r.name, r.serial_number, r.asset_tag),
        subtitle: joinParts([r.serial_number && `Serie ${r.serial_number}`, r.asset_tag && `Activo ${r.asset_tag}`, assignee && `Asignado a ${assignee}`]),
        icon: "Boxes",
        ...(outside ? { matchedIn: "Datos relacionados (notas, compras, resguardos, archivos)" } : {}),
      };
    });
    return { items, total: ids.length };
  },
});
