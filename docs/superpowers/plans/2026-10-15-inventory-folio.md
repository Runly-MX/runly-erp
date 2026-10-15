# Inventory Folio (Phase 1 of QR labels) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every inventory item a unique, auto-generated folio (`TYPE-BRAND-MODEL-N`, e.g. `TEL-CIS-CP7-158`), migrate sinabe's "Folio interno" into it, and show/search/edit it in the inventory UI.

**Architecture:** New nullable `inv_item.folio` (partial unique per company among enabled items, same pattern as `asset_tag`), an optional `code` on types/brands/models, and an atomic per-prefix counter table `inv_folio_counter`. A single helper module (`inventory-folio.js`) owns prefix derivation, parsing and allocation; `createItem`, the legacy import toolkit and a backfill service all call it. Spec: `docs/superpowers/specs/2026-10-15-inventory-labels-qr-design.md` (Phase 1).

**Tech Stack:** Node.js ESM, Prisma 7 + `$queryRaw`, Hono services, `node --test`, React + `@runly/ui`.

**Conventions for every task:**
- Tests: `node --test <file>` (Node built-in runner). Keep tests focused.
- Commit after each task. Stage ONLY the files listed in that task (`git add <paths>`), never `git add -A`: other sessions have unrelated uncommitted changes in this tree. Work on `main` (check `git branch --show-current` first).
- Commit messages end with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`.
- Never start/stop/kill the user's dev servers (4010/5173). Never print env values.
- All UI text in Spanish, code and comments in English. No emojis.

---

## File Structure

| File | Responsibility |
|---|---|
| `apps/api/src/services/inventory-folio.js` (create) | Pure helpers (`codeFromName`, `normalizeCode`, `normalizeFolio`, `folioPrefix`, `parseFolio`, `formatFolio`) and `createFolioAllocator()` (counter + uniqueness) |
| `apps/api/src/services/inventory-folio-backfill.js` (create) | `backfillFolios({ prisma, companyId, apply })`: moves the sinabe custom value into `folio`, generates the rest, seeds counters |
| `scripts/migrations/inventory-folio-backfill.mjs` (create) | Thin CLI over the backfill service |
| `prisma/schema.prisma` (modify) | `InvItem.folio`, `code` on `InvCategory`/`InvBrand`/`InvModel`, `InvFolioCounter` |
| `prisma/migrations/20261025000000_inv_item_folio/migration.sql` (create) | Forward migration |
| `apps/api/src/services/inventory-service.js` (modify) | Folio on create/update, snapshot, sort |
| `apps/api/src/services/inventory-catalog-service.js`, `inventory-model-service.js` (modify) | Accept `code` |
| `apps/api/src/services/legacy-import/inventory-historical.js` (modify) | `importItem` sets/generates folio |
| `apps/api/src/services/inventory-item-import-service.js` (modify) | `folio` import column |
| `apps/api/src/services/inventory-search-service.js` (modify) | Search by folio |
| `scripts/migrations/sinabe/mapping/index.mjs` (+ README, tests) | `internalFolio` -> `data.folio` |
| `packages/ui/src/integrations/inventory/{detail,form}-blueprint.js` (modify) | Show/edit folio |
| `apps/desktop/src/modules/runly.inventory/...` (modify) | Code fields in catalogs, folio column, activity label |

---

### Task 1: Folio helpers and allocator

**Files:**
- Create: `apps/api/src/services/inventory-folio.js`
- Test: `apps/api/src/services/__tests__/inventory-folio.test.js`

- [ ] **Step 1: Write the failing test**

```js
// inventory-folio.test.js — folio prefix derivation, parsing and allocation
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  codeFromName, normalizeCode, normalizeFolio, folioPrefix, parseFolio, formatFolio, createFolioAllocator,
} from '../inventory-folio.js'

const COMPANY_ID = '01900000-0000-7000-8000-000000000001'

describe('folio helpers', () => {
  it('derives codes without accents or symbols', () => {
    assert.equal(codeFromName('Teléfono'), 'TEL')
    assert.equal(codeFromName('cp7821'), 'CP7')
    assert.equal(codeFromName('  ¡! '), '')
    assert.equal(normalizeCode(' lt-1 '), 'LT1')
    assert.equal(normalizeCode('!!'), null)
  })

  it('builds the prefix from codes, then names, then INV', () => {
    assert.equal(folioPrefix({ type: { name: 'Teléfono' }, brand: { name: 'Cisco' }, model: { name: 'cp7821' } }), 'TEL-CIS-CP7')
    assert.equal(folioPrefix({ type: { name: 'Laptop', code: 'lt' }, brand: null, model: null }), 'LT')
    assert.equal(folioPrefix({}), 'INV')
  })

  it('normalizes, parses and formats folios', () => {
    assert.equal(normalizeFolio('  tel-cis-cp7-158 '), 'TEL-CIS-CP7-158')
    assert.equal(normalizeFolio('   '), null)
    assert.deepEqual(parseFolio('TEL-CIS-CP7-158'), { prefix: 'TEL-CIS-CP7', n: 158 })
    assert.equal(parseFolio('ABC'), null)
    assert.equal(parseFolio('X-0'), null)
    assert.equal(formatFolio('TEL-CIS-CP7', 159), 'TEL-CIS-CP7-159')
  })
})

function fakeDb({ counters = new Map(), taken = new Set() } = {}) {
  return {
    counters,
    $queryRaw: async (strings, ...values) => {
      const prefix = values[1]
      const current = counters.get(prefix) ?? 0
      const value = strings.join('?').includes('GREATEST') ? Math.max(current, values[2]) : current + 1
      counters.set(prefix, value)
      return [{ last_value: value }]
    },
    invItem: { findFirst: async ({ where }) => (taken.has(where.folio) ? { id: 'x' } : null) },
    invCategory: { findFirst: async () => ({ name: 'Teléfono', code: null }) },
    invBrand: { findFirst: async () => ({ name: 'Cisco', code: null }) },
    invModel: { findFirst: async () => ({ name: 'cp7821', code: null }) },
  }
}

describe('folio allocator', () => {
  it('continues after an observed folio', async () => {
    const db = fakeDb()
    const folios = createFolioAllocator()
    await folios.observe(db, COMPANY_ID, 'TEL-CIS-CP7-158')
    const next = await folios.forItem(db, COMPANY_ID, { categoryId: 'c', brandId: 'b', modelId: 'm' })
    assert.equal(next, 'TEL-CIS-CP7-159')
  })

  it('skips a folio already used by an active item', async () => {
    const db = fakeDb({ taken: new Set(['TEL-CIS-CP7-1']) })
    const next = await createFolioAllocator().forItem(db, COMPANY_ID, { categoryId: 'c', brandId: 'b', modelId: 'm' })
    assert.equal(next, 'TEL-CIS-CP7-2')
  })

  it('uses INV and the free-text model when there is no catalog data', async () => {
    const db = fakeDb()
    const folios = createFolioAllocator()
    assert.equal(await folios.forItem(db, COMPANY_ID, {}), 'INV-1')
    assert.equal(await folios.forItem(db, COMPANY_ID, { model: 'XPS 15' }), 'XPS-1')
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test apps/api/src/services/__tests__/inventory-folio.test.js`
Expected: FAIL (`Cannot find module '../inventory-folio.js'`).

- [ ] **Step 3: Write the implementation**

```js
// inventory-folio.js — item folios: TYPE-BRAND-MODEL-N (e.g. TEL-CIS-CP7-158).
// The consecutive is per company and per prefix and comes from an atomic
// counter (inv_folio_counter), never from read-then-write.
import { InventoryServiceError } from './inventory-guards.js';

export const FOLIO_MAX = 100;
const MAX_COUNTER = 2_000_000_000;

// "Teléfono" -> "TEL". Accents stripped, letters/digits only, upper case.
export function codeFromName(name, max = 3) {
  return String(name ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, max);
}

// Catalog `code` column value: up to 6 letters/digits, or null.
export function normalizeCode(value) {
  return codeFromName(value, 6) || null;
}

export function normalizeFolio(value) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim().toUpperCase();
  return text || null;
}

// parts: { type, brand, model } each { code?, name? } | null
export function folioPrefix({ type, brand, model } = {}) {
  const segments = [type, brand, model]
    .map((part) => (part ? normalizeCode(part.code) || codeFromName(part.name) : ''))
    .filter(Boolean);
  return segments.length ? segments.join('-') : 'INV';
}

export function parseFolio(folio) {
  const match = /^(.+)-(\d{1,10})$/.exec(String(folio ?? ''));
  if (!match) return null;
  const n = Number(match[2]);
  return n >= 1 && n <= MAX_COUNTER ? { prefix: match[1], n } : null;
}

export const formatFolio = (prefix, n) => `${prefix}-${n}`;

export function createFolioAllocator() {
  // Raises the counter of the folio's prefix to at least its number.
  async function observe(db, companyId, folio) {
    const parsed = parseFolio(folio);
    if (!parsed) return;
    await db.$queryRaw`
      INSERT INTO inv_folio_counter (company_id, prefix, last_value)
      VALUES (${companyId}::uuid, ${parsed.prefix}, ${parsed.n}::int)
      ON CONFLICT (company_id, prefix)
      DO UPDATE SET last_value = GREATEST(inv_folio_counter.last_value, EXCLUDED.last_value)
      RETURNING last_value`;
  }

  async function next(db, companyId, prefix) {
    const rows = await db.$queryRaw`
      INSERT INTO inv_folio_counter (company_id, prefix, last_value)
      VALUES (${companyId}::uuid, ${prefix}, 1)
      ON CONFLICT (company_id, prefix)
      DO UPDATE SET last_value = inv_folio_counter.last_value + 1
      RETURNING last_value`;
    return Number(rows[0].last_value);
  }

  // Catalog rows of an item, falling back to its free-text model name.
  async function partsFor(db, companyId, { categoryId, brandId, modelId, model } = {}) {
    const pick = (row) => (row ? { code: row.code, name: row.name } : null);
    const select = { name: true, code: true };
    const [type, brand, catalogModel] = await Promise.all([
      categoryId ? db.invCategory.findFirst({ where: { id: categoryId, companyId }, select }) : null,
      brandId ? db.invBrand.findFirst({ where: { id: brandId, companyId }, select }) : null,
      modelId ? db.invModel.findFirst({ where: { id: modelId, companyId }, select }) : null,
    ]);
    return { type: pick(type), brand: pick(brand), model: pick(catalogModel) ?? (model ? { name: model } : null) };
  }

  async function allocate(db, companyId, parts) {
    const prefix = folioPrefix(parts);
    for (let attempt = 0; attempt < 25; attempt++) {
      const folio = formatFolio(prefix, await next(db, companyId, prefix));
      const taken = await db.invItem.findFirst({ where: { companyId, folio, enabled: true }, select: { id: true } });
      if (!taken) return folio;
    }
    throw new InventoryServiceError('No se pudo asignar un folio disponible.', 409);
  }

  const forItem = async (db, companyId, input) => allocate(db, companyId, await partsFor(db, companyId, input));

  return { observe, allocate, forItem, partsFor };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test apps/api/src/services/__tests__/inventory-folio.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/inventory-folio.js apps/api/src/services/__tests__/inventory-folio.test.js
git commit -m "feat(inventory): folio helpers and atomic per-prefix allocator"
```

---

### Task 2: Schema and migration

**Files:**
- Modify: `prisma/schema.prisma` (`InvCategory` ~3496, `InvBrand` ~3521, `InvModel` ~3603, `InvItem` ~3630, `Company` line ~483)
- Create: `prisma/migrations/20261025000000_inv_item_folio/migration.sql`

- [ ] **Step 1: Edit `prisma/schema.prisma`**

In `model InvCategory`, `model InvBrand` and `model InvModel`, add this line right after the `name` field of each:

```prisma
  // Short prefix used in item folios (letters/digits, max 6). Empty = derived from the name.
  code        String?  @db.VarChar(6)
```

In `model InvItem`, after the `assetTag` line add:

```prisma
  // Auto-generated TYPE-BRAND-MODEL-N identifier; unique per company among enabled items (partial unique index in the migration).
  folio         String?   @db.VarChar(100)
```

and next to `@@index([companyId, assetTag])` add `@@index([companyId, folio])`.

In `model Company`, below the `invModels       InvModel[]       @relation("CompanyInvModels")` line (483) add:

```prisma
  invFolioCounters InvFolioCounter[] @relation("CompanyInvFolioCounters")
```

After `model InvItem { ... }` add:

```prisma
model InvFolioCounter {
  companyId String @db.Uuid @map("company_id")
  prefix    String @db.VarChar(100)
  lastValue Int    @default(0) @map("last_value")

  company Company @relation("CompanyInvFolioCounters", fields: [companyId], references: [id], onDelete: Cascade)

  @@id([companyId, prefix])
  @@map("inv_folio_counter")
}
```

- [ ] **Step 2: Create the migration**

`prisma/migrations/20261025000000_inv_item_folio/migration.sql`:

```sql
-- Item folio (TYPE-BRAND-MODEL-N). Optional at the column level so existing rows
-- can be backfilled by scripts/migrations/inventory-folio-backfill.mjs; unique per
-- company only among active items, like asset_tag. Prisma cannot express a
-- partial unique index, so it lives here only.
ALTER TABLE "inv_item" ADD COLUMN "folio" VARCHAR(100);
CREATE UNIQUE INDEX "inv_item_company_folio_active_key" ON "inv_item"("company_id", "folio") WHERE "enabled" = true AND "folio" IS NOT NULL;
CREATE INDEX "inv_item_company_id_folio_idx" ON "inv_item"("company_id", "folio");

ALTER TABLE "inv_category" ADD COLUMN "code" VARCHAR(6);
ALTER TABLE "inv_brand" ADD COLUMN "code" VARCHAR(6);
ALTER TABLE "inv_model" ADD COLUMN "code" VARCHAR(6);

CREATE TABLE "inv_folio_counter" (
  "company_id" UUID NOT NULL,
  "prefix" VARCHAR(100) NOT NULL,
  "last_value" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "inv_folio_counter_pkey" PRIMARY KEY ("company_id", "prefix"),
  CONSTRAINT "inv_folio_counter_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "company"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
```

- [ ] **Step 3: Verify the company table name**

Run: `grep -n "^model Company " -A3 prisma/schema.prisma | head; grep -n '@@map("company")' prisma/schema.prisma`
Expected: a `@@map("company")` line. If the table name differs, fix the `REFERENCES` in the migration to match.

- [ ] **Step 4: Validate, generate and apply**

Run: `pnpm exec prisma validate` then `pnpm db:generate` then `pnpm db:migrate`
Expected: validate OK; generate OK; migrate applies `20261025000000_inv_item_folio`. If `generate` fails with EPERM because the running API holds the query engine, stop and tell the user (do not kill their dev servers).

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/20261025000000_inv_item_folio/migration.sql
git commit -m "feat(inventory): folio column, catalog codes and folio counter table"
```

---

### Task 3: Folio in `createItem` / `updateItem`

**Files:**
- Modify: `apps/api/src/services/inventory-service.js` (imports, `ITEM_SORTS` ~47, `createInventoryService` ~84, `toFlatSnapshot` ~238, `createItem` ~315-478, `updateItem` ~481-570)
- Modify: `apps/api/src/services/__tests__/inventory-service.test.js` (mock builder + new tests)

- [ ] **Step 1: Extend the test mock and write failing tests**

In `buildPrismaMock` (inventory-service.test.js), inside the returned object add before `$transaction:`:

```js
    invModel: {
      findFirst: async () => ({ id: 'model-1' }),
      ...(overrides.invModel ?? {}),
    },
    $queryRaw: async () => [{ last_value: 1 }],
```

Append at the end of the file:

```js
// ---------------------------------------------------------------------------
// folio
// ---------------------------------------------------------------------------

describe('item folio', () => {
  it('generates a folio on create', async () => {
    let capturedData = null
    const prisma = buildPrismaMock({
      invCategory: { findFirst: async () => ({ id: 'cat-1', name: 'Teléfono', code: null }) },
      invBrand: { findFirst: async () => ({ id: 'brand-1', name: 'Cisco', code: null }) },
      invItem: { count: async () => 0, create: async (args) => { capturedData = args.data; return { id: ITEM_ID, ...args.data } }, findFirst: async () => null },
    })
    const svc = createInventoryService({ prisma })
    await svc.createItem({ name: 'Tel', categoryId: 'cat-1', brandId: 'brand-1', model: 'cp7821' }, COMPANY_ID, USER_ID)
    assert.equal(capturedData.folio, 'TEL-CIS-CP7-1')
  })

  it('keeps a manual folio, normalized, and rejects a duplicate', async () => {
    let capturedData = null
    const prisma = buildPrismaMock({
      invItem: { count: async () => 0, create: async (args) => { capturedData = args.data; return { id: ITEM_ID, ...args.data } }, findFirst: async () => null },
    })
    await createInventoryService({ prisma }).createItem({ name: 'A', folio: ' tel-cis-cp7-158 ' }, COMPANY_ID, USER_ID)
    assert.equal(capturedData.folio, 'TEL-CIS-CP7-158')

    const taken = buildPrismaMock({ invItem: { count: async () => 0, findFirst: async () => ({ id: 'other' }) } })
    await assert.rejects(
      () => createInventoryService({ prisma: taken }).createItem({ name: 'B', folio: 'TEL-CIS-CP7-158' }, COMPANY_ID, USER_ID),
      (err) => err instanceof InventoryServiceError && err.status === 409,
    )
  })

  it('updates the folio only when it really changes and never blanks it', async () => {
    let updated = null
    const existing = { id: ITEM_ID, companyId: COMPANY_ID, enabled: true, name: 'X', folio: 'INV-1', category: null, brand: null, location: null }
    const prisma = buildPrismaMock({
      invItem: {
        findFirst: async (args) => (args?.where?.folio ? null : existing),
        update: async (args) => { updated = args.data; return { ...existing, ...args.data } },
      },
    })
    const svc = createInventoryService({ prisma, activityBridge: { logAndPublish: async () => {} } })
    await svc.updateItem(ITEM_ID, { folio: 'INV-1', notes: 'n' }, COMPANY_ID)
    assert.equal(updated.folio, undefined)
    await svc.updateItem(ITEM_ID, { folio: ' inv-9 ' }, COMPANY_ID)
    assert.equal(updated.folio, 'INV-9')
    await assert.rejects(() => svc.updateItem(ITEM_ID, { folio: '  ' }, COMPANY_ID), (err) => err.status === 400)
  })
})
```

Check that `InventoryServiceError` exposes `.status`: `grep -n "class InventoryServiceError" -A8 apps/api/src/services/inventory-guards.js`. If the property is named differently (e.g. `statusCode`), use that name in the three assertions above.

- [ ] **Step 2: Run to verify they fail**

Run: `node --test apps/api/src/services/__tests__/inventory-service.test.js`
Expected: the 3 new tests FAIL (`capturedData.folio` undefined); existing tests still pass.

- [ ] **Step 3: Implement in `inventory-service.js`**

Add to the imports at the top:

```js
import { FOLIO_MAX, createFolioAllocator, normalizeFolio } from './inventory-folio.js';
```

In `ITEM_SORTS` add `folio: (dir) => ({ folio: dir }),` after the `assetTag` entry.

Inside `createInventoryService`, after `const assertRefInCompany = createRefGuard(prisma);` add:

```js
  const folios = createFolioAllocator();

  // Throws when another active item of the company already uses this folio.
  async function assertFolioFree(folio, companyId, excludeId = null) {
    if (folio.length > FOLIO_MAX) throw new InventoryServiceError(`El folio admite hasta ${FOLIO_MAX} caracteres.`, 400);
    const taken = await prisma.invItem.findFirst({
      where: { companyId, folio, enabled: true, ...(excludeId ? { id: { not: excludeId } } : {}) },
      select: { id: true },
    });
    if (taken) throw new InventoryServiceError(`El folio ${folio} ya existe.`, 409);
  }

  // A manual folio wins (and moves the counter past it); otherwise one is generated.
  async function resolveCreateFolio(data, companyId) {
    const manual = normalizeFolio(data.folio);
    if (!manual) return folios.forItem(prisma, companyId, data);
    await assertFolioFree(manual, companyId);
    await folios.observe(prisma, companyId, manual);
    return manual;
  }
```

In `toFlatSnapshot` add `folio: item.folio ?? null,` after the `assetTag` line (~242).

In `createItem`, right after the `assetTag` auto-generation block (after the closing brace at ~333) add `const folio = await resolveCreateFolio(data, companyId);` and in `let itemData = { companyId, assetTag, ...` add `folio,` after `assetTag,`. In the two `after: { name: created.name, assetTag: created.assetTag }` audit objects add `folio: created.folio ?? null`.

In `updateItem`, after the `serialChanged || tagChanged` block (~532) add:

```js
    // Forms resend the current folio; only a real change is validated. An item
    // without folio (pre-backfill) ignores a blank value.
    let nextFolio;
    if (data.folio !== undefined) {
      const wanted = normalizeFolio(data.folio);
      if (!wanted && existing.folio) throw new InventoryServiceError('El folio no puede quedar vacío.', 400);
      if (wanted && wanted !== existing.folio) {
        await assertFolioFree(wanted, companyId, id);
        nextFolio = wanted;
      }
    }
```

and after `if (assetTag !== undefined) updateData.assetTag = assetTag;` add:

```js
    if (nextFolio) {
      updateData.folio = nextFolio;
      await folios.observe(prisma, companyId, nextFolio);
    }
```

- [ ] **Step 4: Run to verify**

Run: `node --test apps/api/src/services/__tests__/inventory-service.test.js apps/api/src/services/__tests__/inventory-folio.test.js`
Expected: all PASS.

- [ ] **Step 5: Check the list mapper returns `folio`**

Run: `grep -n "\.\.\.item\b" apps/api/src/services/inventory-service.js | head`
Expected: the list row mapper spreads the Prisma row (so `folio` is included). If it builds an explicit object instead, add `folio: item.folio ?? null`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/services/inventory-service.js apps/api/src/services/__tests__/inventory-service.test.js
git commit -m "feat(inventory): assign, validate and edit item folios"
```

---

### Task 4: Catalog codes in the API

**Files:**
- Modify: `apps/api/src/services/inventory-catalog-service.js` (`createCategory` ~70, `updateCategory` ~84, `createBrand` ~123, `updateBrand` ~132)
- Modify: `apps/api/src/services/inventory-model-service.js` (`modelInput` ~6, `create` ~106, `update` ~129)
- Test: `apps/api/src/services/__tests__/inventory-catalog-service.test.js`

- [ ] **Step 1: Write the failing test** (append to the file; it already imports `test`, `assert`, `createInventoryCatalogService` and defines `COMPANY`)

```js
test('createBrand and updateCategory normalize the folio code', async () => {
  const calls = { brand: null, category: null }
  const prisma = {
    invBrand: { create: async (args) => { calls.brand = args.data; return { id: 'b1', ...args.data } } },
    invCategory: {
      findFirst: async () => ({ id: TYPE }),
      update: async (args) => { calls.category = args.data; return { id: TYPE, ...args.data } },
    },
  }
  const svc = createInventoryCatalogService({ prisma })
  await svc.createBrand({ name: 'Cisco', code: ' cis ' }, COMPANY)
  await svc.updateCategory(TYPE, { code: 'te-l' }, COMPANY)
  assert.equal(calls.brand.code, 'CIS')
  assert.equal(calls.category.code, 'TEL')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test apps/api/src/services/__tests__/inventory-catalog-service.test.js`
Expected: FAIL (`created.code` undefined).

- [ ] **Step 3: Implement**

In `inventory-catalog-service.js` add `import { normalizeCode } from './inventory-folio.js';` and:
- `createCategory`: destructure `code` with the other fields and add `if (code !== undefined) createData.code = normalizeCode(code);`
- `updateCategory`: same destructure plus `if (code !== undefined) updateData.code = normalizeCode(code);`
- `createBrand` (`const { name, description, website } = data;`): add `code` and `if (code !== undefined) createData.code = normalizeCode(code);`
- `updateBrand`: add `code` and `if (code !== undefined) updateData.code = normalizeCode(code);`

In `inventory-model-service.js` add `import { normalizeCode } from './inventory-folio.js';`, add `code: z.string().trim().max(6).nullable().optional(),` to `modelInput`, set `code: normalizeCode(data.code)` inside the `prisma.invModel.create` `data` object, and add `...(data.code !== undefined ? { code: normalizeCode(data.code) } : {}),` to the `update` data object.

- [ ] **Step 4: Run to verify**

Run: `node --test apps/api/src/services/__tests__/inventory-catalog-service.test.js apps/api/src/services/__tests__/inventory-model-service.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/inventory-catalog-service.js apps/api/src/services/inventory-model-service.js apps/api/src/services/__tests__/inventory-catalog-service.test.js
git commit -m "feat(inventory): optional folio code on types, brands and models"
```

---

### Task 5: Legacy import sets the folio

**Files:**
- Modify: `apps/api/src/services/legacy-import/inventory-historical.js` (`importItem` ~132-170)
- Test (create): `apps/api/src/services/__tests__/legacy-import-inventory-folio.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createInventoryHistorical } from '../legacy-import/inventory-historical.js'

const COMPANY_ID = '01900000-0000-7000-8000-000000000001'

function build({ takenFolios = new Set() } = {}) {
  const created = []
  const counters = new Map()
  const anyModel = new Proxy({}, { get: () => async (args) => ({ id: 'row', ...(args?.data ?? {}) }) })
  const tx = new Proxy(
    { invItem: { create: async ({ data }) => { created.push(data); return { id: 'item-1', ...data } } } },
    { get: (target, key) => target[key] ?? anyModel },
  )
  const prisma = {
    invItem: { findFirst: async ({ where }) => (where.folio && takenFolios.has(where.folio) ? { id: 'other' } : null) },
    $queryRaw: async (strings, ...values) => {
      const prefix = values[1]
      const current = counters.get(prefix) ?? 0
      const value = strings.join('?').includes('GREATEST') ? Math.max(current, values[2]) : current + 1
      counters.set(prefix, value)
      return [{ last_value: value }]
    },
  }
  const refs = { find: async () => null, ensure: async (_key, fn) => ({ id: await fn(tx), created: true }) }
  return { created, importer: createInventoryHistorical({ prisma, refs, fileStore: null, defaultSource: 'sinabe' }) }
}

describe('importItem folio', () => {
  it('stores the requested folio normalized', async () => {
    const { created, importer } = build()
    const result = await importer.importItem({ companyId: COMPANY_ID, legacyId: 'a', data: { name: 'Tel', folio: ' tel-cis-cp7-158 ' } })
    assert.equal(created[0].folio, 'TEL-CIS-CP7-158')
    assert.deepEqual(result.warnings, [])
  })

  it('generates a folio when the requested one is taken', async () => {
    const { created, importer } = build({ takenFolios: new Set(['TEL-CIS-CP7-158']) })
    const result = await importer.importItem({ companyId: COMPANY_ID, legacyId: 'b', data: { name: 'Tel', folio: 'TEL-CIS-CP7-158' } })
    assert.equal(created[0].folio, 'INV-1')
    assert.deepEqual(result.warnings, ['FOLIO_DUPLICATE'])
  })

  it('generates a folio when none is requested', async () => {
    const { created, importer } = build()
    await importer.importItem({ companyId: COMPANY_ID, legacyId: 'c', data: { name: 'Tel' } })
    assert.equal(created[0].folio, 'INV-1')
  })
})
```

If `writeImportAudit` or another helper calls a `tx` member that the Proxy default cannot satisfy (for example a raw query), extend the `tx` stub with that member; do not change production code to fit the test.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test apps/api/src/services/__tests__/legacy-import-inventory-folio.test.js`
Expected: FAIL (`created[0].folio` undefined).

- [ ] **Step 3: Implement**

At the top of `inventory-historical.js` add `import { FOLIO_MAX, createFolioAllocator, normalizeFolio } from '../inventory-folio.js';`. Inside `createInventoryHistorical` add `const folios = createFolioAllocator();`.

In `importItem`, after `await assertRefs(companyId, fields);` and `const warnings = [];` add:

```js
    // Requested folio (sinabe's internal folio) when free; otherwise a generated one.
    let folio = normalizeFolio(data.folio);
    if (folio && folio.length > FOLIO_MAX) { folio = null; warnings.push('FOLIO_TOO_LONG'); }
    if (folio && enabled && await prisma.invItem.findFirst({ where: { companyId, folio, enabled: true }, select: { id: true } })) {
      folio = null;
      warnings.push('FOLIO_DUPLICATE');
    }
    if (folio) await folios.observe(prisma, companyId, folio);
    else folio = await folios.forItem(prisma, companyId, fields);
```

and in the `tx.invItem.create` data add `folio,` after `assetTag,`: `companyId, assetTag, folio, enabled, ...fields, ...statusFields,`. Include `folio` in the audit `after` object.

- [ ] **Step 4: Run to verify**

Run: `node --test apps/api/src/services/__tests__/legacy-import-inventory-folio.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/legacy-import/inventory-historical.js apps/api/src/services/__tests__/legacy-import-inventory-folio.test.js
git commit -m "feat(inventory): legacy item import assigns folios"
```

---

### Task 6: Backfill service and CLI

**Files:**
- Create: `apps/api/src/services/inventory-folio-backfill.js`
- Create: `scripts/migrations/inventory-folio-backfill.mjs`
- Test: `apps/api/src/services/__tests__/inventory-folio-backfill.test.js`

- [ ] **Step 1: Write the failing test**

```js
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { backfillFolios } from '../inventory-folio-backfill.js'

const COMPANY_ID = '01900000-0000-7000-8000-000000000001'

function fakePrisma(items, values) {
  const counters = new Map()
  const prisma = {
    items,
    counters,
    invItem: {
      findMany: async ({ where }) => (where.folio === null ? items.filter((i) => !i.folio) : items.filter((i) => i.folio)),
      findFirst: async ({ where }) => items.find((i) => i.enabled && i.folio === where.folio) ?? null,
      update: async ({ where, data }) => { Object.assign(items.find((i) => i.id === where.id), data); return {} },
    },
    invCustomFieldValue: { findMany: async () => values },
    invCategory: { findFirst: async () => ({ name: 'Teléfono', code: null }) },
    invBrand: { findFirst: async () => ({ name: 'Cisco', code: null }) },
    invModel: { findFirst: async () => null },
    $queryRaw: async (strings, ...v) => {
      const prefix = v[1]
      const current = counters.get(prefix) ?? 0
      const value = strings.join('?').includes('GREATEST') ? Math.max(current, v[2]) : current + 1
      counters.set(prefix, value)
      return [{ last_value: value }]
    },
  }
  return prisma
}

const item = (id, extra = {}) => ({ id, enabled: true, folio: null, categoryId: 'c', brandId: 'b', modelId: null, model: 'cp7821', createdAt: new Date(2026, 0, Number(id.slice(1))), ...extra })

describe('backfillFolios', () => {
  it('moves the sinabe folio, handles duplicates and continues the counter', async () => {
    const items = [item('i1'), item('i2'), item('i3'), item('i4')]
    const values = [
      { itemId: 'i1', value: ' tel-cis-cp7-158 ' },
      { itemId: 'i2', value: 'TEL-CIS-CP7-158' }, // duplicate of i1
      { itemId: 'i3', value: '' },
    ]
    const prisma = fakePrisma(items, values)
    const report = await backfillFolios({ prisma, companyId: COMPANY_ID, apply: true })
    assert.equal(items[0].folio, 'TEL-CIS-CP7-158')
    assert.equal(items[1].folio, 'TEL-CIS-CP7-159')
    assert.equal(items[2].folio, 'TEL-CIS-CP7-160')
    assert.equal(items[3].folio, 'TEL-CIS-CP7-161')
    assert.deepEqual({ fromCustomField: report.fromCustomField, duplicates: report.duplicates, generated: report.generated }, { fromCustomField: 1, duplicates: 1, generated: 3 })
  })

  it('writes nothing without apply', async () => {
    const items = [item('i1')]
    const prisma = fakePrisma(items, [{ itemId: 'i1', value: 'TEL-CIS-CP7-5' }])
    const report = await backfillFolios({ prisma, companyId: COMPANY_ID, apply: false })
    assert.equal(items[0].folio, null)
    assert.equal(report.fromCustomField, 1)
  })

  it('is idempotent', async () => {
    const items = [item('i1', { folio: 'INV-1' })]
    const report = await backfillFolios({ prisma: fakePrisma(items, []), companyId: COMPANY_ID, apply: true })
    assert.equal(report.total, 0)
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test apps/api/src/services/__tests__/inventory-folio-backfill.test.js`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement `inventory-folio-backfill.js`**

```js
// inventory-folio-backfill.js — gives a folio to every item of a company that has none.
// 1) the sinabe custom value ("Folio interno (sinabe)") when it is usable and unique,
// 2) a generated folio for the rest, in creation order. Counters are seeded first so
// generated folios continue after the migrated ones. Idempotent; the custom value is
// left untouched as provenance.
import { FOLIO_MAX, createFolioAllocator, normalizeFolio, parseFolio } from './inventory-folio.js';

export const SINABE_FOLIO_FIELD_KEY = 'sinabe_folio_interno';

export async function backfillFolios({ prisma, companyId, apply = false, fieldKey = SINABE_FOLIO_FIELD_KEY }) {
  const folios = createFolioAllocator();
  const pending = await prisma.invItem.findMany({
    where: { companyId, folio: null },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, enabled: true, categoryId: true, brandId: true, modelId: true, model: true },
  });
  const report = { total: pending.length, fromCustomField: 0, duplicates: 0, tooLong: 0, generated: 0, counterPrefixes: 0 };
  if (!pending.length) return report;

  const existing = await prisma.invItem.findMany({ where: { companyId, folio: { not: null } }, select: { folio: true, enabled: true } });
  const used = new Set(existing.filter((row) => row.enabled).map((row) => row.folio));
  const values = await prisma.invCustomFieldValue.findMany({
    where: { item: { companyId, folio: null }, field: { companyId, fieldKey } },
    select: { itemId: true, value: true },
  });
  const wantedById = new Map(values.map((row) => [row.itemId, normalizeFolio(row.value)]));

  const assigned = new Map(); // itemId -> folio taken from the custom value
  for (const row of pending) {
    const wanted = wantedById.get(row.id);
    if (!wanted) continue;
    if (wanted.length > FOLIO_MAX) { report.tooLong++; continue; }
    if (row.enabled && used.has(wanted)) { report.duplicates++; continue; }
    if (row.enabled) used.add(wanted);
    assigned.set(row.id, wanted);
  }
  report.fromCustomField = assigned.size;

  // Counters first: migrated and already-assigned folios move them past their numbers.
  const prefixes = new Set();
  for (const folio of [...existing.map((row) => row.folio), ...assigned.values()]) {
    const parsed = parseFolio(folio);
    if (parsed) prefixes.add(parsed.prefix);
    if (apply) await folios.observe(prisma, companyId, folio);
  }
  report.counterPrefixes = prefixes.size;

  for (const row of pending) {
    const folio = assigned.get(row.id);
    if (folio) {
      if (apply) await prisma.invItem.update({ where: { id: row.id }, data: { folio } });
      continue;
    }
    report.generated++;
    if (apply) {
      const generated = await folios.forItem(prisma, companyId, row);
      await prisma.invItem.update({ where: { id: row.id }, data: { folio: generated } });
    }
  }
  return report;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test apps/api/src/services/__tests__/inventory-folio-backfill.test.js`
Expected: PASS (3 tests).

- [ ] **Step 5: Create the CLI** `scripts/migrations/inventory-folio-backfill.mjs`

```js
// Gives a folio to every inventory item of a company that has none.
//   node --env-file=.env scripts/migrations/inventory-folio-backfill.mjs --company <uuid> [--apply]
// Without --apply it only counts. Prints counts only; never connection details.
import { parseArgs } from 'node:util'
import { apiModule, assertTarget, createRunlyContext } from './sinabe/runly-context.mjs'

const { values } = parseArgs({ options: { company: { type: 'string' }, apply: { type: 'boolean', default: false } } })

const ctx = await createRunlyContext({ needStorage: false })
try {
  await assertTarget(ctx.prisma, { companyId: values.company })
  const { backfillFolios } = await apiModule('services/inventory-folio-backfill.js')
  const report = await backfillFolios({ prisma: ctx.prisma, companyId: values.company, apply: values.apply })
  console.log(JSON.stringify(report, null, 2))
  if (!values.apply) console.log('Simulación: agrega --apply para escribir los folios.')
} catch (error) {
  console.error(error?.message ?? error)
  process.exitCode = 1
} finally {
  await ctx.close()
}
```

- [ ] **Step 6: Dry-run against the Test company**

Run: `node --env-file=.env scripts/migrations/inventory-folio-backfill.mjs --company <TEST_COMPANY_UUID>` (get the Test company id from `.e2e` scripts / memory `reference_local_e2e`, do not print it from `.env`).
Expected: JSON report with counts, then the "Simulación" line. Report the counts to the user. Run with `--apply` only if the user confirms; it writes data.

- [ ] **Step 7: Commit**

```bash
git add apps/api/src/services/inventory-folio-backfill.js apps/api/src/services/__tests__/inventory-folio-backfill.test.js scripts/migrations/inventory-folio-backfill.mjs
git commit -m "feat(inventory): folio backfill from sinabe custom value"
```

---

### Task 7: Sinabe migrator maps `internalFolio` to `folio`

**Files:**
- Modify: `scripts/migrations/sinabe/mapping/index.mjs` (inside `mapItem` -> `data`, ~line 90)
- Modify: `scripts/migrations/sinabe/README.md` (line ~265 and the mapping section)
- Modify: `docs/superpowers/specs/2026-10-14-sinabe-migrator-design.md` (line ~49)
- Test: `scripts/migrations/sinabe/__tests__/mapping.test.mjs`

- [ ] **Step 1: Write the failing test** in `mapping.test.mjs`, next to the existing `mapItem` tests (copy how they build the model with `createMapping`/synthetic source): assert that for an inventory with `internalFolio: 'TEL-CIS-CP7-158'`, `mapItem(inv).data.folio === 'TEL-CIS-CP7-158'` and that the custom value for `sinabe_folio_interno` is still present; and for `internalFolio: null`, `data.folio` is `null`.

- [ ] **Step 2: Run to verify it fails**

Run: `node --test scripts/migrations/sinabe/__tests__/mapping.test.mjs`
Expected: FAIL (`data.folio` undefined).

- [ ] **Step 3: Implement**

In `mapping/index.mjs`, in the `data: { ... }` object of `mapItem`, after `assetTag: tag.assetTag,` add:

```js
        // Native folio; importItem falls back to a generated one when empty or duplicated.
        folio: clean(inv.internalFolio),
```

Define `clean` at the top of that file if it is not already imported (`const clean = (value) => { const text = value == null ? '' : String(value).trim(); return text || null }`). Duplicates are resolved by `importItem` (warning `FOLIO_DUPLICATE`).

In `README.md` and the sinabe spec, replace the statement that `internalFolio` only goes to the custom field with: `internalFolio` -> `folio` (native, TYPE-BRAND-MODEL-N); the value is also kept in "Folio interno (sinabe)"; empty or duplicated folios get a generated one; already-migrated companies run `scripts/migrations/inventory-folio-backfill.mjs`.

- [ ] **Step 4: Surface the new warnings in the report**

Run: `grep -n "ITEM_CUSTOM_FIELD_UNKNOWN" scripts/migrations/sinabe/*.mjs`. In `migrate-items.mjs` after `if (result.warnings?.length) run.report.warn('ITEM_CUSTOM_FIELD_UNKNOWN', result.warnings.length)` change to count by code:

```js
        for (const code of result.warnings ?? []) run.report.warn(code === 'FOLIO_DUPLICATE' || code === 'FOLIO_TOO_LONG' ? code : 'ITEM_CUSTOM_FIELD_UNKNOWN')
```

(`importItem` pushes folio codes plus the existing unknown-custom-field warnings; map every non-folio entry to the old code so report keys do not change.) If `run.report.warn` has a fixed list of known codes, add the two new ones there (`grep -n "warn(" scripts/migrations/sinabe/report.mjs`).

- [ ] **Step 5: Run to verify**

Run: `node --test scripts/migrations/sinabe/__tests__/`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add scripts/migrations/sinabe docs/superpowers/specs/2026-10-14-sinabe-migrator-design.md
git commit -m "feat(sinabe): migrate internalFolio into the native item folio"
```

---

### Task 8: Item import column, search and sort

**Files:**
- Modify: `apps/api/src/services/inventory-item-import-service.js` (`ITEM_IMPORT_FIELDS` ~line 29; `createItem` call ~line 398)
- Modify: `apps/api/src/services/inventory-search-service.js` (column list ~line 26)
- Test: `apps/api/src/services/__tests__/inventory-item-import-service.test.js`

- [ ] **Step 1: Write the failing test** (append to `inventory-item-import-service.test.js`; add `ITEM_IMPORT_FIELDS` to the file's existing import from `../inventory-item-import-service.js`)

```js
describe('folio import column', () => {
  it('maps the Folio header to folio, not to the asset number', () => {
    const field = (key) => ITEM_IMPORT_FIELDS.find((f) => f.key === key)
    assert.ok(field('folio').aliases.includes('folio'))
    assert.ok(!field('assetTag').aliases.includes('folio'))
  })
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test apps/api/src/services/__tests__/inventory-item-import-service.test.js`
Expected: FAIL (`folio` currently maps to `assetTag`).

- [ ] **Step 3: Implement**

In `ITEM_IMPORT_FIELDS`: remove `'folio'` from the `assetTag` aliases and add, right after the `assetTag` entry:

```js
  { key: 'folio', label: 'Folio', group: 'Identificación', aliases: ['folio', 'folio_interno', 'folio_de_activo'] },
```

In the `inventoryService.createItem({ ... })` call (~line 398) add `folio: d.folio || undefined,` after `assetTag`. Check that the parsed row `d` carries every mapped key generically: `grep -n "ITEM_IMPORT_FIELDS" apps/api/src/services/inventory-item-import-service.js`; if rows are built by iterating the field list, nothing else is needed; if keys are enumerated by hand, add `folio` next to `serialNumber`.

In `inventory-search-service.js` add `'i.folio',` right after `'i.asset_tag',` in the `like([...])` list.

- [ ] **Step 4: Run to verify**

Run: `node --test apps/api/src/services/__tests__/inventory-item-import-service.test.js apps/api/src/services/__tests__/inventory-search-service.test.js`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/services/inventory-item-import-service.js apps/api/src/services/inventory-search-service.js apps/api/src/services/__tests__/inventory-item-import-service.test.js
git commit -m "feat(inventory): folio import column and search"
```

---

### Task 9: UI - codes in catalogs, folio in forms, detail, list and history

**Files:**
- Modify: `apps/desktop/src/modules/runly.inventory/components/catalogs/BrandsPanel.jsx`
- Modify: `apps/desktop/src/modules/runly.inventory/components/catalogs/TypesPanel.jsx`
- Modify: `apps/desktop/src/modules/runly.inventory/components/InventoryModelDialog.jsx`
- Modify: `packages/ui/src/integrations/inventory/detail-blueprint.js` (kpis ~line 35, identification ~line 46)
- Modify: `packages/ui/src/integrations/inventory/form-blueprint.js` (~line 62)
- Modify: `apps/desktop/src/modules/runly.inventory/screens/InventoryScreen.jsx` (~line 113)
- Modify: `apps/desktop/src/modules/runly.inventory/lib/activity-field-labels.js` (line 17)

- [ ] **Step 1: Brands panel** - `BrandsPanel.jsx`:
  - `const EMPTY = { name: '', code: '', description: '', website: '' }`
  - in `open`, the object becomes `{ name: row.name, code: row.code ?? '', description: row.description ?? '', website: row.website ?? '' }`
  - in `save`, send `{ ...form, code: form.code.trim() || null }` for both `update.mutateAsync({ id: editing.id, ...payload })` and `create.mutateAsync(payload)` (define `const payload = { ...form, code: form.code.trim() || null }` first)
  - after the "Nombre" `TextField` add:

```jsx
        <TextField label="Código para folios" value={form.code} maxLength={6} placeholder="DEL"
          hint="Hasta 6 letras o números. Si lo dejas vacío se usa el inicio del nombre."
          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} />
```

- [ ] **Step 2: Types panel** - `TypesPanel.jsx`: `EMPTY` gets `code: ''`; `open` row mapping gets `code: row.code ?? ''`; `payload` becomes `{ ...form, name: form.name.trim(), code: form.code.trim() || null, parentId: ... }`; after the "Nombre" `TextField` (line ~96) add the same "Código para folios" field with `placeholder="LAP"`.

- [ ] **Step 3: Model dialog** - `InventoryModelDialog.jsx`: `EMPTY` gets `code: ''`; the `model ?` mapping in the effect gets `code: model.code ?? ''`; the `save.mutateAsync` payload gets `code: values.code.trim() || null,`; below the name/year grid add:

```jsx
          <TextField label="Código para folios" value={values.code} maxLength={6} hint="XPS. Si lo dejas vacío se usa el inicio del nombre."
            onChange={(e) => set('code', e.target.value.toUpperCase())} />
```

- [ ] **Step 4: Detail blueprint** - `detail-blueprint.js`: in `kpis`, before the serial entry add `{ label: 'Folio', field: 'folio', icon: 'Hash', copyable: true, prominent: true, emptyLabel: 'Sin folio' },`; in the `identification` section `fields`, as the first entry add `{ field: 'folio', label: 'Folio', icon: 'Hash' },`.

- [ ] **Step 5: Form blueprint** - `form-blueprint.js`: before the `serialNumber` field add:

```js
          { field: 'folio', label: 'Folio', type: 'text', icon: 'Hash', hint: 'Se genera solo si lo dejas vacío', hiddenWhen: { field: '__multi', truthy: true } },
```

(copy the `hiddenWhen` object exactly as used by the neighbouring `serialNumber` line).

- [ ] **Step 6: List column and history label** - `InventoryScreen.jsx`: above the `assetTag` column add `{ field: 'folio', label: 'Folio', sortable: true },`. `activity-field-labels.js`: after `name` add `folio: { label: 'Folio', type: 'text' },`.

- [ ] **Step 7: Run package and desktop tests, then build**

Run: `node --test packages/ui/src/ apps/desktop/src/modules/runly.inventory/lib/__tests__/` then `pnpm lint` then `pnpm build:web`
Expected: tests PASS (fix any blueprint snapshot that lists identification fields), lint clean, build succeeds.

- [ ] **Step 8: Commit**

```bash
git add apps/desktop/src/modules/runly.inventory/components/catalogs/BrandsPanel.jsx apps/desktop/src/modules/runly.inventory/components/catalogs/TypesPanel.jsx apps/desktop/src/modules/runly.inventory/components/InventoryModelDialog.jsx apps/desktop/src/modules/runly.inventory/screens/InventoryScreen.jsx apps/desktop/src/modules/runly.inventory/lib/activity-field-labels.js packages/ui/src/integrations/inventory/detail-blueprint.js packages/ui/src/integrations/inventory/form-blueprint.js
git commit -m "feat(inventory): folio in forms, detail, list, history and catalog codes"
```

---

### Task 10: Final verification and docs

**Files:**
- Modify: `docs/TASKS.md` (add an entry under the inventory section)

- [ ] **Step 1: Run the full API and migrator suites**

Run: `node --test apps/api/src/services/__tests__/ scripts/migrations/sinabe/__tests__/`
Expected: all pass except any failure that already existed before this plan (compare with `git stash`-free evidence: re-run the failing file on `git show HEAD~N` only if needed; report pre-existing failures as such).

- [ ] **Step 2: End-to-end check with the local E2E company** (see memory `reference_local_e2e`; use the existing `.e2e` scripts, reuse the running API on 4010, never restart it): create an item via API without folio and confirm the response has a `folio` shaped `TYPE-BRAND-MODEL-N`; create a second with the same type/brand/model and confirm the consecutive increments; try a manual duplicate and confirm HTTP 409. In the browser (Playwright script from `.e2e`) open the item detail and confirm the Folio KPI and copy button render at desktop and ~390px width.

- [ ] **Step 3: Update `docs/TASKS.md`** with a checked line only for what step 1 and 2 proved, formatted `- [x] Inventory folio (spec 2026-10-15 phase 1). Verified: 2026-10-15 (...evidence...)`. Leave Phases 2-4 of the spec as unchecked items.

- [ ] **Step 4: Commit**

```bash
git add docs/TASKS.md
git commit -m "docs: record inventory folio phase 1 status"
```

---

## Self-review notes

- **Spec coverage:** folio column + partial unique (T2), prefix/nomenclature/counters (T1), type/brand/model `code` + UI (T4, T9), assignment on create + manual + edit (T3), migration of the sinabe custom value (T6), sinabe migrator change (T7), importer column and alias fix (T8), legacy toolkit (T5). Phases 2-4 (labels, public page, kiosk, printing) get their own plans after this one ships.
- **Known gotcha handled:** the item importer used to alias the header `folio` to `assetTag` (T8); the existing `asset_tag` auto-generation (`INV-YYYY-NNNN`) in `createItem` is intentionally left untouched.
- **Type consistency:** `createFolioAllocator()` returns `{ observe, allocate, forItem, partsFor }`; T3, T5 and T6 use only those. `normalizeFolio`, `normalizeCode`, `parseFolio`, `FOLIO_MAX` are defined in T1 and imported by name elsewhere.
