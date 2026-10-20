# Inventory Areas - Phase 1 (areas and scoped visibility) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Items belong to an optional area (nested folder); users without `inventory.scope.all` only see and edit items of areas where they are members.

**Architecture:** New tables `inv_area` / `inv_area_member` plus `inv_item.area_id`. A pure module (`inventory-scope.js`) expands memberships down the area tree and builds a Prisma `where` fragment. Scoping is opt-in per company (`InstanceConfig` key `inventory.areas.enabled:<companyId>`), so deploying changes nothing until an admin turns it on. List reads add the fragment to the `where`; routes that take an item id or a list of ids go through one guard.

**Tech Stack:** Node ESM, Hono, Prisma 7 (`$queryRaw` not needed), `node --test`, React + TanStack Query, `@runly/ui`.

**Rules that apply (CLAUDE.md):** UUID v7 defaults (`uuidv7()` in SQL), new forward migration only, Spanish UI text / English code, no `window.confirm`, files under 1000 lines, commit each verified block on `main`, never print secrets, do not start/stop the user's dev servers (reuse the running API on 4010; check `/health`).

## File structure

- Create `prisma/migrations/20261111000000_inventory_areas/migration.sql` - tables, column, index.
- Modify `prisma/schema.prisma` - `InvArea`, `InvAreaMember`, `InvItem.areaId`.
- Create `apps/api/src/services/inventory-scope.js` - pure helpers + `createInventoryScope({ prisma })`.
- Create `apps/api/src/services/__tests__/inventory-scope.test.js`.
- Create `apps/api/src/services/inventory-area-service.js` - area CRUD, members, move item(s).
- Create `apps/api/src/services/__tests__/inventory-area-service.test.js`.
- Create `apps/api/src/routes/inventory/area-routes.js` - `/inventory/areas*`, `/inventory/areas/settings`.
- Create `apps/api/src/routes/inventory/scope-guard.js` - Hono middleware for item-id and id-list routes.
- Modify `apps/api/src/permission-catalog.js` and the `inventoryMap` manifest permissions (`apps/api/src/manifests/official/core-modules.js`).
- Modify `apps/api/src/services/inventory-query.js` (`buildInventoryWhere` takes `scope`), `inventory-service.js`, `inventory-dashboard-service.js`, `inventory-search-service.js`, `inventory-scan-service.js`, `inventory-label-service.js`, `inventory-custody-service.js`, `inventory-admin-service.js`, `inventory-item-import-service.js`, `inventory-intake-service.js`.
- Modify `apps/api/src/routes/inventory/index.js` and sibling routers to pass `scope`.
- Modify other readers: `services/capabilities/inventory-queries.js`, `services/search/inventory-provider.js`, `mcp/adapters/inventory.js`, `routes/canvas/canvas-data-sources.js`.
- Create `packages/sdk/src/domains/inventory-areas.js` and export from `packages/sdk/src/index.js`.
- Create `apps/desktop/src/modules/runly.inventory/hooks/useInventoryAreas.js`, `screens/InventoryAreasScreen.jsx`, `components/areas/*`, area field in the item form, tree filter in `InventoryScreen.jsx`; register route and nav entry.
- Docs: `docs/ai-context/rme3-runtime-capabilities.md` (inventory note), `docs/ai-context/mirai-module-capabilities.md` (scope note).

---

### Task 1: Schema and migration

**Files:** create migration; modify `prisma/schema.prisma`.

- [ ] **Step 1: Write the migration**

```sql
-- runly.inventory: areas (nested folders) and per-user area membership

CREATE TABLE "inv_area" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "company_id" UUID NOT NULL,
    "parent_id" UUID,
    "name" VARCHAR(150) NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inv_area_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inv_area_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inv_area_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "inv_area"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "inv_area_company_id_parent_id_idx" ON "inv_area"("company_id", "parent_id");
CREATE UNIQUE INDEX "inv_area_company_parent_name_key" ON "inv_area"("company_id", COALESCE("parent_id", '00000000-0000-0000-0000-000000000000'::uuid), lower("name")) WHERE "enabled";

CREATE TABLE "inv_area_member" (
    "id" UUID NOT NULL DEFAULT uuidv7(),
    "area_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'viewer',
    "invited_by_id" UUID,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "inv_area_member_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "inv_area_member_role_check" CHECK ("role" IN ('viewer','editor','manager')),
    CONSTRAINT "inv_area_member_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "inv_area"("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "inv_area_member_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "user_profile"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "inv_area_member_area_id_user_id_key" ON "inv_area_member"("area_id", "user_id");
CREATE INDEX "inv_area_member_user_id_idx" ON "inv_area_member"("user_id");

ALTER TABLE "inv_item" ADD COLUMN "area_id" UUID;
ALTER TABLE "inv_item" ADD CONSTRAINT "inv_item_area_id_fkey" FOREIGN KEY ("area_id") REFERENCES "inv_area"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "inv_item_company_id_area_id_idx" ON "inv_item"("company_id", "area_id");
```

Phase 3 will add `guest_id` and relax `user_id` in its own migration.

- [ ] **Step 2: Add the Prisma models** (match naming of neighbours such as `InvCategory`)

```prisma
model InvArea {
  id          String   @id @default(uuid(7)) @db.Uuid
  companyId   String   @db.Uuid @map("company_id")
  parentId    String?  @db.Uuid @map("parent_id")
  name        String   @db.VarChar(150)
  enabled     Boolean  @default(true)
  createdById String?  @db.Uuid @map("created_by_id")
  createdAt   DateTime @default(now()) @map("created_at")
  updatedAt   DateTime @updatedAt @map("updated_at")

  company  Company         @relation("CompanyInvAreas", fields: [companyId], references: [id], onDelete: Cascade)
  parent   InvArea?        @relation("InvAreaTree", fields: [parentId], references: [id], onDelete: SetNull)
  children InvArea[]       @relation("InvAreaTree")
  members  InvAreaMember[]
  items    InvItem[]

  @@index([companyId, parentId])
  @@map("inv_area")
}

model InvAreaMember {
  id          String   @id @default(uuid(7)) @db.Uuid
  areaId      String   @db.Uuid @map("area_id")
  userId      String   @db.Uuid @map("user_id")
  role        String   @default("viewer") @db.VarChar(20)
  invitedById String?  @db.Uuid @map("invited_by_id")
  createdAt   DateTime @default(now()) @map("created_at")

  area InvArea     @relation(fields: [areaId], references: [id], onDelete: Cascade)
  user UserProfile @relation("UserInvAreaMemberships", fields: [userId], references: [id], onDelete: Cascade)

  @@unique([areaId, userId])
  @@index([userId])
  @@map("inv_area_member")
}
```

In `InvItem` add `areaId String? @db.Uuid @map("area_id")`, `area InvArea? @relation(fields: [areaId], references: [id], onDelete: SetNull)` and `@@index([companyId, areaId])`. Add `invAreas InvArea[] @relation("CompanyInvAreas")` to `Company` and `invAreaMemberships InvAreaMember[] @relation("UserInvAreaMemberships")` to `UserProfile`.

- [ ] **Step 3: Apply and generate**

Run: `pnpm db:migrate` then `pnpm db:generate`. Expected: migration `20261111000000_inventory_areas` applied, client regenerated. If the Prisma name of the `Company`/`UserProfile` relation fields differs, fix to what `prisma validate` asks for.

- [ ] **Step 4: Commit** `git add prisma && git commit -m "feat(inventory): areas schema (inv_area, inv_area_member, inv_item.area_id)"`.

---

### Task 2: Scope module (pure logic first)

**Files:** create `apps/api/src/services/inventory-scope.js` and its test.

- [ ] **Step 1: Failing tests** (`apps/api/src/services/__tests__/inventory-scope.test.js`)

```js
import test from 'node:test';
import assert from 'node:assert/strict';
import { expandAreaRoles, scopeWhere, canViewArea, canWriteArea, createInventoryScope } from '../inventory-scope.js';

const A = '01900000-0000-7000-8000-00000000000a';
const B = '01900000-0000-7000-8000-00000000000b'; // child of A
const C = '01900000-0000-7000-8000-00000000000c'; // child of B
const D = '01900000-0000-7000-8000-00000000000d'; // unrelated root
const areas = [{ id: A, parentId: null }, { id: B, parentId: A }, { id: C, parentId: B }, { id: D, parentId: null }];

test('membership on a parent covers descendants and the strongest role wins', () => {
  const roles = expandAreaRoles(areas, [{ areaId: A, role: 'viewer' }, { areaId: C, role: 'editor' }]);
  assert.equal(roles.get(A), 'viewer'); assert.equal(roles.get(B), 'viewer'); assert.equal(roles.get(C), 'editor');
  assert.equal(roles.has(D), false);
});

test('a child whose parent is disabled (absent) is treated as a root', () => {
  const roles = expandAreaRoles([{ id: B, parentId: A }], [{ areaId: B, role: 'manager' }]);
  assert.equal(roles.get(B), 'manager');
});

test('scopeWhere: all -> null; limited -> area filter; empty -> matches nothing', () => {
  assert.equal(scopeWhere({ all: true }), null);
  assert.deepEqual(scopeWhere({ all: false, roles: new Map([[A, 'viewer']]) }), { areaId: { in: [A] } });
  assert.deepEqual(scopeWhere({ all: false, roles: new Map() }), { areaId: { in: [] } });
});

test('view/write checks', () => {
  const s = { all: false, roles: new Map([[A, 'viewer'], [B, 'editor']]) };
  assert.equal(canViewArea(s, A), true); assert.equal(canViewArea(s, null), false); assert.equal(canViewArea(s, D), false);
  assert.equal(canWriteArea(s, A), false); assert.equal(canWriteArea(s, B), true);
  assert.equal(canViewArea({ all: true }, null), true); assert.equal(canWriteArea({ all: true }, null), true);
});

test('resolve: feature off or scope.all -> all; otherwise memberships', async () => {
  const prisma = {
    instanceConfig: { findUnique: async ({ where }) => (where.key.endsWith(':co1') ? { value: 'true' } : null) },
    invArea: { findMany: async () => areas.map((a) => ({ ...a, companyId: 'co1' })) },
    invAreaMember: { findMany: async () => [{ areaId: A, role: 'viewer' }] },
  };
  const scope = createInventoryScope({ prisma });
  const ctx = (extra) => ({ isAdmin: false, permissionSet: new Set(extra) });
  assert.equal((await scope.resolve({ companyId: 'co2', userId: 'u', userContext: ctx([]) })).all, true); // feature off
  assert.equal((await scope.resolve({ companyId: 'co1', userId: 'u', userContext: ctx(['inventory.scope.all']) })).all, true);
  assert.equal((await scope.resolve({ companyId: 'co1', userId: 'u', userContext: { isAdmin: true, permissionSet: new Set() } })).all, true);
  const limited = await scope.resolve({ companyId: 'co1', userId: 'u', userContext: ctx([]) });
  assert.equal(limited.all, false); assert.deepEqual([...limited.roles.keys()].sort(), [A, B, C].sort());
});
```

- [ ] **Step 2: Run, expect FAIL** - `node --test apps/api/src/services/__tests__/inventory-scope.test.js` (module not found).

- [ ] **Step 3: Implement** `apps/api/src/services/inventory-scope.js`

```js
// inventory-scope.js - which inventory areas a user may see/edit.
// Scoping is opt-in per company (InstanceConfig `inventory.areas.enabled:<companyId>`); when off,
// or for admins / holders of inventory.scope.all, the scope is `{ all: true }` (no filtering).
const RANK = { viewer: 1, editor: 2, manager: 3 };
const best = (a, b) => ((RANK[a] ?? 0) >= (RANK[b] ?? 0) ? a : b);

export const SCOPE_ALL_PERMISSION = 'inventory.scope.all';
export const areasEnabledKey = (companyId) => `inventory.areas.enabled:${companyId}`;

// areas: enabled areas [{ id, parentId }]; memberships: [{ areaId, role }] of one user.
// Returns Map(areaId -> role) including descendants of every member area.
export function expandAreaRoles(areas, memberships) {
  const ids = new Set(areas.map((a) => a.id));
  const children = new Map();
  const roots = [];
  for (const a of areas) {
    if (a.parentId && ids.has(a.parentId)) children.set(a.parentId, [...(children.get(a.parentId) ?? []), a.id]);
    else roots.push(a.id);
  }
  const direct = new Map(memberships.map((m) => [m.areaId, m.role]));
  const roles = new Map();
  const seen = new Set();
  const visit = (id, inherited) => {
    if (seen.has(id)) return;
    seen.add(id);
    const role = direct.has(id) ? (inherited ? best(inherited, direct.get(id)) : direct.get(id)) : inherited;
    if (role) roles.set(id, role);
    for (const child of children.get(id) ?? []) visit(child, role);
  };
  roots.forEach((id) => visit(id, null));
  return roles;
}

// Prisma where-fragment for inv_item, or null when unrestricted.
export function scopeWhere(scope) {
  if (!scope || scope.all) return null;
  return { areaId: { in: [...scope.roles.keys()] } };
}

export const canViewArea = (scope, areaId) => Boolean(scope?.all || (areaId && scope?.roles?.has(areaId)));
export const canWriteArea = (scope, areaId) =>
  Boolean(scope?.all || (areaId && RANK[scope?.roles?.get(areaId)] >= RANK.editor));
export const canManageArea = (scope, areaId) =>
  Boolean(scope?.all || (areaId && RANK[scope?.roles?.get(areaId)] >= RANK.manager));

export function createInventoryScope({ prisma }) {
  async function isEnabled(companyId) {
    const row = await prisma.instanceConfig.findUnique({ where: { key: areasEnabledKey(companyId) } });
    return row?.value === 'true';
  }
  // input: { companyId, userId (profile id), userContext } as set by the auth middleware.
  async function resolve({ companyId, userId, userContext }) {
    if (userContext?.isAdmin || userContext?.permissionSet?.has?.(SCOPE_ALL_PERMISSION)) return { all: true };
    if (!(await isEnabled(companyId))) return { all: true };
    const [areas, members] = await Promise.all([
      prisma.invArea.findMany({ where: { companyId, enabled: true }, select: { id: true, parentId: true } }),
      prisma.invAreaMember.findMany({ where: { userId, area: { companyId, enabled: true } }, select: { areaId: true, role: true } }),
    ]);
    return { all: false, userId, companyId, roles: expandAreaRoles(areas, members) };
  }
  // Per-request memo so several guards in one request resolve once.
  async function fromContext(c) {
    const cached = c.get('invScope');
    if (cached) return cached;
    const scope = await resolve({ companyId: c.get('companyId'), userId: c.get('userId'), userContext: c.get('userContext') });
    c.set('invScope', scope);
    return scope;
  }
  return { resolve, fromContext, isEnabled };
}
```

- [ ] **Step 4: Run, expect PASS.** Step 5: commit `feat(inventory): scope resolution (areas tree, roles, per-company opt-in)`.

---

### Task 3: Permissions

**Files:** `apps/api/src/permission-catalog.js` (after `inventory.label.manage`), manifest `permissions` list in `apps/api/src/manifests/official/core-modules.js` (inventory block near line 1409).

- [ ] **Step 1:** Add to the catalog (follow the existing entry shape; orders 40 and 41 if free, otherwise next free in group):

```js
  "inventory.scope.all": {
    displayNameEs: "Ver todos los inventarios",
    descriptionEs: "Permite ver los items de todas las areas, sin importar a que carpetas pertenezca. Sin este permiso solo se ven las areas donde se es miembro.",
    groupKey: "inventory",
    order: 12,
  },
  "inventory.area.manage": {
    displayNameEs: "Gestionar areas de inventario",
    descriptionEs: "Permite crear, renombrar, mover y desactivar areas, y administrar sus miembros.",
    groupKey: "inventory",
    order: 13,
  },
```
- [ ] **Step 2:** Add `{ key: 'inventory.scope.all', name: 'Ver todos los inventarios' }` and `{ key: 'inventory.area.manage', name: 'Gestionar areas de inventario' }` to the manifest permissions array.
- [ ] **Step 3:** Run `node --test apps/api/src/manifests/official/__tests__/ apps/api/src/__tests__/` (whatever tests cover the catalog; fix any that pin the permission count), then `pnpm db:seed` so the Permission rows exist. Commit `feat(inventory): scope.all and area.manage permissions`.

---

### Task 4: Area service (CRUD, members, moves)

**Files:** create `inventory-area-service.js` and test.

Contract (all functions take `companyId` first-class and throw `InventoryServiceError` with Spanish messages):

```js
createInventoryAreaService({ prisma }) -> {
  listTree(companyId, scope),                       // enabled areas visible to scope + memberCount/itemCount
  createArea({ companyId, actorId, name, parentId }),
  updateArea({ companyId, id, name, parentId }),    // rename and/or move; rejects cycles
  disableArea({ companyId, id }),                   // soft delete; items go to General (area_id NULL), children become roots
  listMembers(companyId, areaId),
  setMember({ companyId, areaId, userId, role, actorId }),   // upsert; user must have a Membership in the company
  removeMember({ companyId, areaId, userId }),
  moveItems({ companyId, itemIds, areaId, scope }),          // areaId null = General; requires write on source and destination
  getSettings(companyId), setEnabled(companyId, enabled),
}
```

- [ ] **Step 1: Failing tests** with a fake prisma covering: duplicate sibling name -> 409; cycle on move (`B.parent = C` where C is B's descendant) -> 400; `moveItems` rejects an item whose current area the scope cannot write; `setMember` rejects a user without membership in the company (`prisma.membership.findFirst` null) -> 400; `disableArea` clears `inv_item.area_id` via `invItem.updateMany({ where: { companyId, areaId: id }, data: { areaId: null } })` inside `$transaction`.
- [ ] **Step 2:** Run, expect FAIL. **Step 3:** implement. Cycle check: walk `parentId` upward from the proposed parent through an in-memory map of the company's areas; if it reaches `id`, reject. Names trimmed, 1-150 chars. Duplicate check relies on the unique index; catch Prisma `P2002` and rethrow as 409 `Ya existe un area con ese nombre en esta carpeta.`. `setEnabled` upserts `InstanceConfig` key `areasEnabledKey(companyId)` to `'true'`/`'false'`.
- [ ] **Step 4:** Run, expect PASS. **Step 5:** commit `feat(inventory): area service`.

---

### Task 5: Item-level guard and scoped reads in the item service

**Files:** `routes/inventory/scope-guard.js`; `inventory-query.js`; `inventory-service.js`; their tests.

- [ ] **Step 1: Failing tests.** In `inventory-access-query.test.js` add: `buildInventoryWhere(COMPANY, {}, { all: false, roles: new Map([['a1','viewer']]) })` returns a `where` containing `areaId: { in: ['a1'] }` (use `where.AND` so it composes with existing `AND`/`OR`), and with `{ all: true }` or no scope returns a `where` identical to today's. In `inventory-service.test.js` add: `listItems({ companyId, scope })` passes the scope fragment to `findMany`/`count`, and `getItem(id, companyId, scope)` returns 404 (not 403, to avoid revealing existence) for an item whose `areaId` is outside scope.
- [ ] **Step 2:** Run, expect FAIL.
- [ ] **Step 3: Implement.**
  - `buildInventoryWhere(companyId, filters = {}, scope = null)`: at the end, `const frag = scopeWhere(scope); if (frag) where.AND = [...(where.AND ?? []), frag];` (import `scopeWhere`). `where.AND` is already an array when `missingSerial` is set, so spread it.
  - `listItems({ ..., scope })` forwards `scope` to every `buildInventoryWhere` call (lines ~194-197). `getItem(id, companyId, scope)`: after load, `if (scope && !canViewArea(scope, item.areaId)) throw new InventoryServiceError('Item no encontrado.', 404)`. `updateItem`/`deleteItem`/`assignItem`/`returnItem`/files helpers keep their signatures; they are protected by the route guard below, not by extra params.
  - `createItem` accepts `areaId` in `data`, validates it belongs to the company (`assertRefInCompany('invArea', ...)`) and writes it; `updateItem` accepts `areaId` likewise (a change requires write on both areas - enforced in the route guard, Task 6).
  - `scope-guard.js` exports:

```js
import { canViewArea, canWriteArea } from '../../services/inventory-scope.js';

// Resolves scope once per request and checks the item named by :id (or :itemId).
export function createScopeGuards({ prisma, inventoryScope }) {
  const WRITE = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
  // Use as router.use('/inventory/items/:id', itemGuard) and '/inventory/items/:id/*'.
  const itemGuard = async (c, next) => {
    const id = c.req.param('id');
    if (!id || ['check-identifiers', 'bulk', 'validate-batch', 'admin-transition', 'by-employee'].includes(id)) return next();
    const scope = await inventoryScope.fromContext(c);
    if (scope.all) return next();
    const item = await prisma.invItem.findFirst({ where: { id, companyId: c.get('companyId'), enabled: true }, select: { areaId: true } });
    if (!item) return next(); // handler returns its own 404
    const ok = WRITE.has(c.req.method) ? canWriteArea(scope, item.areaId) : canViewArea(scope, item.areaId);
    if (!ok) return c.json({ error: 'Item no encontrado.' }, 404);
    return next();
  };
  // For bodies/queries that carry item ids; returns the ids the scope may see/write, or throws.
  async function idsInScope(c, ids, { write = false } = {}) {
    const scope = await inventoryScope.fromContext(c);
    if (scope.all || ids.length === 0) return ids;
    const rows = await prisma.invItem.findMany({ where: { id: { in: ids }, companyId: c.get('companyId') }, select: { id: true, areaId: true } });
    const allowed = new Set(rows.filter((r) => (write ? canWriteArea(scope, r.areaId) : canViewArea(scope, r.areaId))).map((r) => r.id));
    return ids.filter((id) => allowed.has(id));
  }
  return { itemGuard, idsInScope };
}
```
  Hono note: `router.use(path, mw)` must be registered before the handlers it protects, so Task 6 puts the `use` calls at the top of `createInventoryRouter`, before the `router.route('/', ...)` mounts. The `:id` segment literal exclusions exist because `/inventory/items/check-identifiers` etc. share the pattern.
- [ ] **Step 4:** Run `node --test apps/api/src/services/__tests__/inventory-access-query.test.js apps/api/src/services/__tests__/inventory-service.test.js apps/api/src/services/__tests__/inventory-tenant-isolation.test.js`, expect PASS. **Step 5:** commit `feat(inventory): scoped item queries and per-item guard`.

---

### Task 6: Wire the routers (audit table, every call site)

**Files:** `routes/inventory/index.js`, `admin-routes.js`, `custody-routes.js`, `import-routes.js`, `intake-routes.js`, `label-routes.js`, `scan-routes.js`; `apps/api/src/index.js` (construct `inventoryScope` and pass it into `createInventoryRouter`).

- [ ] **Step 1:** In `apps/api/src/index.js` where `createInventoryRouter` is called (~line 2481) create `const inventoryScope = createInventoryScope({ prisma })` and pass `inventoryScope` (also into the sub-routers via `createInventoryRouter`). At the top of `createInventoryRouter`, before any `router.route(...)`: `router.use('/inventory/items/:id', itemGuard); router.use('/inventory/items/:id/*', itemGuard);`.
- [ ] **Step 2: Apply to each call site.** Every row must be done and covered by the test in Task 7:

| Endpoint | Change |
|---|---|
| `GET /inventory/items` | `scope = await inventoryScope.fromContext(c)`; pass `scope` to `listItems` |
| `GET /inventory/items/:id` | `getItem(id, companyId, scope)` |
| `GET /inventory/items/check-identifiers` | pass scope; for duplicates outside scope return `{ exists: true }` without the item payload (uniqueness stays company-wide) |
| `POST /inventory/items` | require `canWriteArea(scope, body.areaId ?? null)`; a limited user must send an `areaId` they can write (else 403 `Elige un area donde puedas registrar items.`) |
| `PUT/PATCH /inventory/items/:id` | guard covers the current area; if `body.areaId` is present and differs, also require `canWriteArea(scope, body.areaId)` |
| `DELETE`, assign, return, assignments, files, comments, labels, public-link, admin-events, admin-transition (single) | covered by `itemGuard` (`:id` routes) |
| `POST /inventory/items/admin-transition/bulk`, `POST /inventory/items/bulk`, `validate-batch`, `POST /inventory/scan/export`, `POST /inventory/labels/render`, `POST /inventory/labels/prints` | `ids = await idsInScope(c, body.ids, { write })`; if fewer than requested, respond 404 for the rest (never partial silent success) |
| `GET /inventory/items/by-employee/:empId`, `GET /inventory/assignments` | add `item: { ...scopeWhere(scope) }` to the `where` in `getItemsByEmployee` / `listAllAssignments` |
| `GET /inventory/media`, `GET /inventory/label-prints` | filter through `item` relation with `scopeWhere` |
| `GET /inventory/dashboard`, `/dashboard/trend`, `/summary` | pass `scope` into `inventory-dashboard-service` and `inventory-admin-service.summary` (all 13 + 6 `invItem` queries get `...scopeWhere(scope)`) |
| `POST /inventory/scan/resolve` | `inventory-scan-service` applies scope; out-of-scope code resolves as not found |
| `POST /inventory/custodies`, `PATCH /inventory/custodies/:id/items/:itemId` | `idsInScope(..., { write: true })` on `itemIds` |
| `GET /inventory/custodies*` | custody list/detail filtered to custodies whose items intersect scope: `custody.items.some({ item: scopeWhere })` (custodies with no items stay visible to `inventory.custody.manage` holders) |
| `item-import/commit`, `ai/recognize`, `intake` creates | imported rows must carry an `areaId` the user can write (limited users: required) |
| Catalog routes (`types`, `brands`, `locations`, `conditions`, `models`) | unscoped by design (shared catalogs); note in docs |

- [ ] **Step 3:** Run all existing inventory tests: `node --test apps/api/src/services/__tests__/ apps/api/src/routes/inventory/__tests__/`; fix fakes that need `scope` defaulting to `null`. Run `node --check` on edited route files. Commit per router (`feat(inventory): scope <router>`), never staging unrelated files.

---

### Task 7: Isolation test (the safety net)

**Files:** create `apps/api/src/routes/inventory/__tests__/inventory-scope-isolation.test.js`.

- [ ] **Step 1:** Build the inventory router with an in-memory fake `prisma` seeded with 2 areas (`A` member viewer, `B` not member) and one item in each, plus one in General. Stub auth by setting `companyId`, `userId`, `userContext` in a pre-middleware (see how `router.test.js` / `inventory-mirai.test.js` stub it). Assert for a limited user with the feature enabled:
  - list returns only the `A` item; item `B` and General -> 404 on GET, PUT, DELETE, `/files`, `/comments`, `/labels`;
  - `POST /inventory/items` without `areaId` -> 403; with area `B` -> 403; with `A` as viewer -> 403; as editor -> 201;
  - bulk/id-list endpoints reject ids from `B`;
  - same user with `inventory.scope.all`, an admin, and any user when the feature is off see everything.
- [ ] **Step 2:** Run, expect PASS (fix routes until it does). Commit `test(inventory): scope isolation across routes`.

---

### Task 8: Area routes

**Files:** create `routes/inventory/area-routes.js`; mount in `routes/inventory/index.js`.

Endpoints (all `/inventory/areas*`, guarded by `requirePermission('inventory.item.read')` for reads and `inventory.area.manage` for writes, except member management which also allows `canManageArea(scope, areaId)` for area managers):

- `GET /inventory/areas` - tree for the caller (all areas for `scope.all`, otherwise the member areas plus ancestors needed to render the path, flagged `accessible: false` for ancestors the user cannot open).
- `POST /inventory/areas`, `PATCH /inventory/areas/:id`, `DELETE /inventory/areas/:id` (soft).
- `GET|PUT|DELETE /inventory/areas/:id/members[/:userId]`.
- `POST /inventory/items/move` body `{ itemIds, areaId|null }`.
- `GET|PUT /inventory/areas-settings` body `{ enabled }` (PUT requires `inventory.area.manage`; enabling returns the list of roles that currently have `inventory.item.read` but not `inventory.scope.all`, so the UI can warn).
- Validate bodies with zod defined inline in the file (small, inventory-local).

- [ ] **Step 1: Failing route tests** for: non-manager cannot create an area (403); manager of area X can add a member to X but not to Y; cycle move rejected; settings PUT toggles the `InstanceConfig` key.
- [ ] **Step 2-4:** implement, run, pass. **Step 5:** commit `feat(inventory): area routes`.

---

### Task 9: Other readers of `inv_item`

**Files:** `services/capabilities/inventory-queries.js`, `routes/inventory/inventory-mirai-queries.js`, `services/search/inventory-provider.js`, `services/search/suggestions.js`, `mcp/adapters/inventory.js`, `routes/canvas/canvas-data-sources.js`, `services/inventory-chat-actions.js`, `services/comments-service.js` (inventory target), `services/trash/core-trash-providers.js`.

- [ ] **Step 1:** For each, resolve the scope from the actor (`createInventoryScope.resolve({ companyId, userId, userContext })`; for MirAI/MCP/canvas build `userContext` from the same permission loader they already use for `assertCurrent`) and add `...scopeWhere(scope)` to its `invItem` queries. If an actor's permission set is unavailable in that context, fail closed (`{ all: false, roles: new Map() }`) unless the actor is the system.
- [ ] **Step 2:** One focused test per file group asserting a limited actor does not receive out-of-scope items (extend the existing test files: `inventory-mirai.test.js`, `canvas-data-sources.test.js`, `mcp.integration.test.js`).
- [ ] **Step 3:** Run those suites, commit `feat(inventory): scope MirAI, MCP, search and canvas readers`.

Internal systems (purchase bridge, legacy import, company deletion, folio backfill, notifications) are system actors and intentionally unscoped; list them in the docs note.

---

### Task 10: SDK and hooks

**Files:** create `packages/sdk/src/domains/inventory-areas.js`, export in `index.js`; `hooks/useInventoryAreas.js`.

- [ ] **Step 1:** SDK functions mirroring Task 8 endpoints (`listAreas`, `createArea`, `updateArea`, `deleteArea`, `listAreaMembers`, `setAreaMember`, `removeAreaMember`, `moveItems`, `getAreasSettings`, `setAreasSettings`), following the shape of `domains/inventory-custody.js`.
- [ ] **Step 2:** Hooks with TanStack Query keyed `['inventory', 'areas', ...]`; mutations invalidate `['inventory']` (items change too). Follow the `useInventoryItems.js` pattern (token from `useAuth`, `loadingMutation` toasts).
- [ ] **Step 3:** `node --check` both files; commit `feat(inventory): areas SDK and hooks`.

---

### Task 11: UI

**Files:** `screens/InventoryAreasScreen.jsx`, `components/areas/AreaTree.jsx`, `AreaDialog.jsx`, `AreaMembersSheet.jsx`, `AreasSettingsCard.jsx`, `AreaTreeFilter.jsx`; modify `InventoryScreen.jsx`, item form (`InventoryItemForm.jsx` / `InventoryItemClassification.jsx`), `ModuleOutlet.jsx` route registration, manifest navigation entry (`/inventory/areas`, `permissionKey: 'inventory.area.manage'`).

Before writing: read `docs/ai-context/ui-screen-audit-checklist.md` and the dialog/modal memory rules (Dialog size md+, `DialogHeader` icon, fixed header/footer, only body scrolls; inputs `rounded-md`; flat selected rows). Use only `@runly/ui` components (`PageHeader`, `RunlyTable`/tree list, `Dialog`, `Sheet`, `CreatableComboboxField` for the area field, `ConfirmDialog` for disabling, `EmptyState`/`ErrorState`). All text Spanish.

- [ ] **Step 1:** Areas screen: `PageHeader`, settings card with the on/off switch (copy: "Segmentar inventario por areas". When enabling, show the warning "Los usuarios sin el permiso 'Ver todos los inventarios' solo veran las areas donde sean miembros." and confirm with `ConfirmDialog`), tree with item counts, create/rename/move dialog, disable `ConfirmDialog` ("Los items pasaran a General."), members sheet (user picker excluding bots per the "MirAI is never a user" rule, role select viewer/editor/manager, remove).
- [ ] **Step 2:** `InventoryScreen.jsx`: `AreaTreeFilter` (Todas / General / each area) sending `areaId` (`__none__` for General) as a list filter; add `areaId` to `inventoryFiltersSchema` in `inventory-query.js` and `buildInventoryWhere` (`areaId: null` for General) with a unit test. Bulk action "Mover a area" using `moveItems`. Hide the filter when the feature is off and the user has no areas.
- [ ] **Step 3:** Item form: "Area" `CreatableComboboxField` (create disabled; options from `useInventoryAreas`, only areas the user can write); required when the user lacks `inventory.scope.all` and the feature is on. Item detail shows the area as a badge.
- [ ] **Step 4:** Limited user with no areas sees `EmptyState` ("No tienes areas de inventario asignadas. Pide acceso a un administrador.").
- [ ] **Step 5:** `pnpm lint` and `pnpm build:web`; commit `feat(inventory): areas UI`.

---

### Task 12: Docs, real-boot check, final verification

- [ ] **Step 1:** Update `docs/ai-context/rme3-runtime-capabilities.md` (inventory note: areas, scope rules, unscoped shared catalogs, system actors) and `docs/ai-context/mirai-module-capabilities.md` (MirAI respects scope).
- [ ] **Step 2:** `node --test apps/api/src/ packages/` and `pnpm lint`; expect all pass except any pre-existing unrelated failure (name it if present).
- [ ] **Step 3:** Against the already-running API (check `GET /health`; do not start/stop servers), with a Test-company limited user token from the environment (`$RUNLY_TOKEN`, never printed): create areas, add the user as viewer, confirm list/detail/write behavior matches Task 7 over HTTP; then toggle the feature off and confirm full visibility returns.
- [ ] **Step 4:** Tick the checklist entries in `docs/TASKS.md` only with `Verified: 2026-MM-DD (...)` evidence. Commit `docs(inventory): areas phase 1`.

## Self-review against the spec

- Areas nested, single area per item, null = General: Tasks 1, 4. Role inheritance to descendants: Task 2.
- `inventory.scope.all`, `inventory.area.manage`; admins implicit: Tasks 2-3. Area managers manage their members: Task 8.
- Every read/write path: Task 6 table plus Task 9, proven by Task 7.
- UI (tree filter, area field, areas screen, bulk move, empty state): Task 11.
- Deviation from spec, deliberate: scoping is opt-in per company (safe rollout, nobody loses access on deploy). Own-items rule (`includeOwn`) and "Míos" filter are phase 2; supplier portal and `guest_id` column are phase 3.
