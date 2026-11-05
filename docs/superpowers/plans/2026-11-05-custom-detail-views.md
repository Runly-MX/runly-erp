# Plan: custom detail views

Spec: `docs/superpowers/specs/2026-11-05-custom-detail-views-design.md`

1. [x] Prisma model `CompanyDetailView` + forward migration; `pnpm db:migrate`, `pnpm db:generate`. Verified: 2026-11-05 (migration `20261226100000_company_detail_view` applied to the dev database, client generated).
2. [x] `apps/api/src/routes/detail-views-routes.js` (registry, Zod, GET/PUT/DELETE) mounted in `index.js`; route test. Verified: 2026-11-05 (`detail-views-routes.test.js` 2/2, `node --check apps/api/src/index.js`).
3. [x] `packages/ui/src/runly-renderer/detail-view-layout.js` (catalog, default, apply) + unit tests. Verified: 2026-11-05 (`detail-view-layout.test.js` 3/3).
4. [x] `packages/ui/src/components/DetailViewDesigner.jsx` (dnd-kit) with state in `detail-view-designer-state.js`, exported from `@runly/ui`, documented in `docs/ai-context/rme3-runtime-capabilities.md`. Verified: 2026-11-05 (`detail-view-designer-state.test.js` 2/2, eslint clean, `pnpm build:web` ok).
5. [x] Inventory: `useDetailView` hook, view applied in `InventoryItemDetail.jsx`, custom values flattened to `custom:<id>`, "Personalizar vista" action, placed custom values skipped in the custom fields block. Verified: 2026-11-05 (eslint clean, `pnpm build:web` ok).
6. [ ] Browser check of the designer (drag cards/fields, save, reset) — pending: the dev servers were not running.
