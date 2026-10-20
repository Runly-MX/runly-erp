# Inventory Areas - Phase 2 ("Mis inventarios") Implementation Plan

**Goal:** A limited user also sees (read-only) the items they created or that are assigned to them, controlled by a company setting; everyone gets a "Mios" quick filter.

**Rules:** same as phase 1 (spec `2026-10-20-inventory-areas-scoping-design.md`). No migration: the setting is an `InstanceConfig` key.

## Design
- `inventory.areas.includeOwn:<companyId>` ('true'/'false'), default true when missing. Exposed by `GET/PUT /inventory/areas-settings` as `{ enabled, includeOwn }` (PUT accepts either).
- `inventoryScope.resolve` adds `own: { userId, employeeIds } | null` (employees = `HrEmployee.userProfileId` = profile). `scopeWhere` becomes `{ OR: [{ areaId: { in } }, { createdById }, { assignedToId: { in } }] }`; with no own clause it keeps the phase-1 shape `{ areaId: { in } }`.
- New `canViewItem(scope, item)` (area OR own). Writes stay area-based (`canWriteArea`): own items are read-only.
- Raw SQL readers use a shared `scopeSql(scope, alias)` fragment instead of `areaIds` (dashboard trends, search provider, suggestions). `areaIdsFor` is removed.
- "Mios": `mine=true` list filter for everyone; identity resolved once per request in the route (`inventoryScope.mineFromContext`) and passed as a 4th argument to `buildInventoryWhere`/`listItems`, never read from the query string.
- Custody: own via `assigned_to_id` only (items inside an active custody are not added).

## Tasks
1. Scope module: `own`, `scopeWhere`, `canViewItem`, `scopeSql`, `includeOwn` setting, `mine`; unit tests.
2. Area service/routes: settings `includeOwn`; tests.
3. Consumers: item guard (`idsInScope`, itemGuard), `getItem`, comments, identifiers, custody routes, dashboard SQL, search provider/suggestions, files visibility; isolation tests (own visible, others not, includeOwn=false restores).
4. `mine` filter: schema, `buildInventoryWhere`, `listItems`, route; tests.
5. SDK + hooks + settings card switch; `InventoryScreen.jsx` "Mios" chip if the file is clean.
6. Docs (`rme3-runtime-capabilities.md`, `TASKS.md`), lint, suites, build.
