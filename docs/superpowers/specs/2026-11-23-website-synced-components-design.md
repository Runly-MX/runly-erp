# Website synced components (Phase 2B)

Status: draft, not implemented. Follow-up of `2026-11-23-native-svg-media-design.md` and the Phase 2 items
"componentes reutilizables" and "sincronización entre páginas" of the KYNTRA evolution report.

## What exists today (verified 2026-11-23)

- Atlas "compositions": a saved selection is inserted as an **editable copy** (`src/templates/compositions.js`,
  compositions panel). Hub stores them (`runly_website_composition_*`, `hub.website_compositions`). A copy never
  follows later edits of its source.
- A Website document is a list of independent pages. The portable package stores one `pages/page-N.json` per page
  and a `theme.json`; the ERP draft stores one document per page. Nothing links a section on page A to one on page B,
  so a header or footer repeated on every page is edited N times.
- Phase 2A (done): theme tokens already cover color/font/size/radius/spacing/shadow; native icons and link states
  were added in Atlas (`IconElementBlock`, `src/icons/registry.js`).

## Problem

Sitewide pieces (navbar, footer, announcement bar, CTA band) must be edited once and update everywhere, while
each page can still override or detach them.

## Design

1. **Component definitions live at document level, not in pages.** A site document gains
   `components: { [componentId]: { name, section } }` where `section` is an ordinary Atlas section tree (same
   shape as a page block, no new block vocabulary inside it). `componentId` is a stable slug
   (`/^[a-z][a-z0-9-]{0,39}$/`), max 50 components, each at most the existing per-page block limits.
2. **Pages reference, never embed.** New block `ComponentRefBlock { componentId, overrides? }`.
   `overrides` is a flat map `{ [blockPath]: { prop: value } }` limited to text/image/link props, so a page may change
   a title while the structure stays synced. Anything else requires **Detach** (inline copy, link broken, one-way).
3. **Resolution is a pure function** `resolveComponents(document) -> pages with refs expanded`, run
   (a) in the Atlas renderer/editor canvas, (b) in the ERP release build, so published sites are static and carry no
   runtime lookup. Cycles are impossible by construction (components cannot contain `ComponentRefBlock`).
4. **Portable format.** Website template stays `formatVersion: 2`; a new optional inventory entry
   `components.json` (declared in the manifest inventory like `theme.json`) plus `ComponentRefBlock` in the
   builder catalog. Packages without it are byte-identical to today; readers that do not know the block already
   fail with `builder_unsupported`/`catalog_digest_mismatch`, so no silent loss.
5. **Hub MCP.** `runly_website_document_save` accepts `document.components`; `runly_website_contract` advertises
   `components: { max, refs: true }` only when the installed reader supports it (same pattern as `svg`).
6. **Editor UX (Atlas).** Selection -> "Convertir en componente" (name) replaces the selection with a ref;
   Inspector shows "Componente: <name>" with Editar componente (edits the definition; all refs update),
   Desvincular (detach) and the override fields. Deleting a definition that is still referenced is blocked and lists
   the pages.

## Phasing

- 2B-1 `resolveComponents` + `ComponentRefBlock` + document schema + tests (Atlas + studio-interchange). No UI.
- 2B-2 Portable format + Hub contract/save + ERP release expansion + migration of existing drafts (none needed:
  `components` is optional).
- 2B-3 Editor UX.

## Out of scope

Cross-site libraries, component versioning, per-breakpoint overrides, overriding structure.

## Verification

Round trip of SENDA and existing templates is byte-identical; a template with 3 pages sharing a footer exports,
re-imports and publishes one definition expanded three times; override and detach cases; hostile `componentId`,
oversized overrides and ref-to-missing-component fail closed with stable codes.
