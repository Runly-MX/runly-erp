# Inventory item: purchase order and invoice as fields

Decisions (no approval gate, user feedback of 2026-10-15).

- Order and invoice are fields of the Identificacion card (detail and form),
  backed by EntityRelation rows owned by runly.purchases: PURCHASED_IN for
  purchase_order, INVOICED_ITEM for purchase_invoice (same types as "Relacionar
  existente"). No migration.
- API: the item create/update payload accepts `purchaseOrderId` /
  `purchaseInvoiceId` (undefined = untouched, null or empty = clear). The link
  changes run inside the item transaction through the same `afterWrite` hook the
  connections use (`services/inventory-purchase-links.js`). A change needs
  `purchases.relation.manage`; an unchanged value needs no permission. Only the
  newest relation of a kind (the one shown) is replaced or cleared; other
  related documents stay visible in "Compras relacionadas".
- GET /inventory/items/:id adds `purchaseOrderLink`, `purchaseInvoiceLink`, ids,
  `canReadPurchases`, `canManagePurchases` (links only with
  `purchases.relation.read`).
- Search (`GET /purchases/documents/search`) now also matches supplier name,
  order supplier reference and the folio of the linked document (invoice from
  order and vice versa).
- Form: custom field control `inventory.purchase-link` (remote search, "folio .
  supplier" options, quick-create dialog with folio required, optional supplier
  and date, through the normal purchases create endpoints, which also open the
  case). Pickers are hidden without `purchases.relation.read`, read-only without
  manage.
- Legacy columns stay; the detail card is collapsed and only appears when one
  has a value; the form inputs only when the item already has one.
- Custom fields in the detail: only fields with a value; an unchecked boolean
  ("false") counts as empty because the form stores it for every item.
- One "Adquisicion y garantia" card (origen, vencimiento, notas); "Ubicacion y
  origen" became "Ubicacion".
- Files: aside placement (top of the right column) and `mobileAfter:
  'identification'` on mobile (see rme3-runtime-capabilities.md).
- Not done: invoice-number fallback in custody snapshots, list and exports (needs
  a relation lookup per row; not a one-line change).
