// Inventory list search: finds item ids whose own fields OR related records
// (assignments, comments, purchases, custody, files, custom fields, admin
// events, catalog names) match every token of the term. Built on the reusable
// helpers in lib/search-tokens.js. One raw query per search; per token a CTE
// unions the id sets of all sources, then the token sets are intersected.
import { Prisma } from '@prisma/client';
import { tokenizeSearch, likeAny, buildTokenIntersectQuery } from '../lib/search-tokens.js';

const EMPLOYEE_COLS = (a) => [`${a}.first_name`, `${a}.last_name`, `(${a}.first_name || ' ' || ${a}.last_name)`, `${a}.employee_code`, `${a}.work_email`, `${a}.personal_email`];
const REL_ITEM_TYPE = 'inventory_item';

// Baja reasons are stored as keys; people search by their Spanish label.
const reasonLabelSql = (col) => `(CASE ${col} WHEN 'obsolescence' THEN 'obsolescencia' WHEN 'damage' THEN 'daño' WHEN 'loss' THEN 'pérdida extravío' WHEN 'theft' THEN 'robo' WHEN 'sale' THEN 'venta' WHEN 'donation' THEN 'donación' WHEN 'destruction' THEN 'destrucción' WHEN 'other' THEN 'otro' ELSE '' END)`;

// SELECT-id fragments for one LIKE pattern. companyId scopes every source.
export function inventorySearchSources(companyId, pattern) {
  const co = (alias) => Prisma.sql`${Prisma.raw(alias)}.company_id = ${companyId}::uuid`;
  const like = (cols) => likeAny(cols, pattern);
  return [
    // Item columns + catalog names + assigned employee (current).
    Prisma.sql`SELECT i.id FROM inv_item i
      LEFT JOIN inv_category cat ON cat.id = i.category_id
      LEFT JOIN inv_brand br ON br.id = i.brand_id
      LEFT JOIN inv_location loc ON loc.id = i.location_id
      LEFT JOIN inv_condition cond ON cond.id = i.condition_id
      LEFT JOIN inv_model mdl ON mdl.id = i.model_id
      LEFT JOIN hr_employee cur ON cur.id = i.assigned_to_id
      WHERE ${co('i')} AND i.enabled = true AND (${like([
        'i.name', 'i.asset_tag', 'i.folio', 'i.serial_number', 'i.part_number', 'i.model', 'i.description', 'i.notes', 'i.vendor_name',
        'i.invoice_number', 'i.warranty_notes', 'i.item_type', "to_char(i.purchase_date, 'YYYY-MM-DD')",
        'cat.name', 'br.name', 'loc.name', 'cond.name', 'mdl.name', ...EMPLOYEE_COLS('cur'),
      ])})`,
    // Assignment history.
    Prisma.sql`SELECT a.item_id AS id FROM inv_assignment a JOIN hr_employee e ON e.id = a.employee_id
      JOIN inv_item i ON i.id = a.item_id AND ${co('i')}
      WHERE ${like(['a.notes', ...EMPLOYEE_COLS('e')])}`,
    // Custom field values and labels.
    Prisma.sql`SELECT v.item_id AS id FROM inv_custom_field_value v JOIN inv_custom_field f ON f.id = v.field_id
      JOIN inv_item i ON i.id = v.item_id AND ${co('i')}
      WHERE ${like(['v.value', 'f.label'])}`,
    // Comments on the item.
    Prisma.sql`SELECT c.entity_id AS id FROM entity_comment c
      WHERE ${co('c')} AND c.entity_type = 'InvItem' AND ${like(['c.body'])}`,
    // Admin events (registration / deregistration notes).
    Prisma.sql`SELECT ev.item_id AS id FROM inv_item_admin_event ev
      WHERE ${co('ev')} AND ${like(['ev.comment', 'ev.reason', reasonLabelSql('ev.reason'), "(CASE ev.action WHEN 'propose_deregistration' THEN 'propuesta de baja' WHEN 'approve_deregistration' THEN 'baja autorizada' WHEN 'reject_deregistration' THEN 'propuesta rechazada' WHEN 'revert_deregistration' THEN 'baja revertida' ELSE '' END)"])}`,
    // Actas de baja (folio, approver, notes, snapshot of every asset in the act).
    Prisma.sql`SELECT ev.item_id AS id FROM inv_deregistration_act ac
      JOIN inv_item_admin_event ev ON ev.act_id = ac.id
      WHERE ${co('ac')} AND ${like(['ac.folio', 'ac.approver_name', 'ac.approver_title', 'ac.comments', reasonLabelSql('ac.reason')])}`,
    // Change proposals for restricted duplicates (message, review note, proposer).
    Prisma.sql`SELECT p.item_id AS id FROM inv_change_proposal p
      WHERE ${co('p')} AND ${like(['p.message', 'p.review_note', 'p.proposer_label', 'p.matched_value'])}`,
    // Attached files.
    Prisma.sql`SELECT f.item_id AS id FROM inv_item_file f JOIN file_asset fa ON fa.id = f.file_asset_id
      JOIN inv_item i ON i.id = f.item_id AND ${co('i')}
      WHERE ${like(['fa.original_name', 'f.label'])}`,
    // Custody records (folio, deliverer, receiver, per-item snapshot).
    Prisma.sql`SELECT ci.item_id AS id FROM inv_custody_item ci JOIN inv_custody cu ON cu.id = ci.custody_id
      LEFT JOIN hr_employee e ON e.id = cu.employee_id
      WHERE ${co('cu')} AND ${like(['cu.folio', 'cu.deliverer_name', 'cu.comments', 'ci.type_brand', 'ci.model', 'ci.serial_number', 'ci.asset_tag', 'ci.invoice_number', 'ci.features', ...EMPLOYEE_COLS('e')])}`,
    // Purchase orders / invoices related to the item (either direction).
    Prisma.sql`SELECT r.item_id AS id FROM (
        SELECT target_id AS item_id, source_type, source_id FROM entity_relation
          WHERE company_id = ${companyId}::uuid AND target_type = ${REL_ITEM_TYPE} AND source_type IN ('purchase_order', 'purchase_invoice')
        UNION ALL
        SELECT source_id, target_type, target_id FROM entity_relation
          WHERE company_id = ${companyId}::uuid AND source_type = ${REL_ITEM_TYPE} AND target_type IN ('purchase_order', 'purchase_invoice')
      ) r
      LEFT JOIN purchase_order po ON r.source_type = 'purchase_order' AND po.id = r.source_id
      LEFT JOIN purchase_invoice pi ON r.source_type = 'purchase_invoice' AND pi.id = r.source_id
      LEFT JOIN purchase_case pc ON pc.id = COALESCE(po.case_id, pi.case_id)
      LEFT JOIN contact sup ON sup.id = COALESCE(po.supplier_id, pi.supplier_id)
      WHERE ${like(['po.number', 'po.notes', 'po.supplier_reference', 'pi.number', 'pi.notes', 'pi.payment_reference', 'pc.number', 'pc.title', 'sup.name', 'sup.legal_name'])}`,
  ];
}

export function buildInventorySearchQuery(companyId, tokens, limit = 5000) {
  return buildTokenIntersectQuery({
    tokens,
    limit,
    sourcesFor: (pattern) => inventorySearchSources(companyId, pattern),
    base: Prisma.sql`SELECT id FROM inv_item WHERE company_id = ${companyId}::uuid AND enabled = true`,
  });
}

export function createInventorySearch({ prisma }) {
  // Returns matched item ids (company scoped, enabled only). Throws on DB errors:
  // callers decide the fallback.
  async function searchItemIds(companyId, term, { limit = 5000 } = {}) {
    if (!companyId) throw new Error('Empresa requerida.');
    const tokens = tokenizeSearch(term);
    if (!tokens.length) return [];
    const rows = await prisma.$queryRaw(buildInventorySearchQuery(companyId, tokens, limit));
    return rows.map((row) => row.id);
  }
  return { searchItemIds };
}
