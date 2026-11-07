# Plan: Studio data workflow

Spec: `docs/superpowers/specs/2026-11-07-studio-data-workflow-design.md`

- [x] T1 `lib/studio-bulk.js`: add `removeRow`, `addRow`, `searchRows` (pure) + tests.
- [x] T2 `lib/element-library.js`: `CODE_PRESETS`. `ElementsLibrary`: "Códigos dinámicos" section with rule builder; wire `onAddCode`/`columns` from `StudioWorkspace`. Remove codes from `TextPanel`.
- [x] T3 `RecordsDialog.jsx` (editable table) and `DataPanel.jsx` (replaces `BulkDataSection`); rail item `data`; `StudioWorkspace` panel + insert as text/QR/barcode.
- [x] T4 `DesignEditor`: dataset state, pass `dataset`/`onDataset` through `chrome` -> `StudioTopBar` -> `ExportDialog`.
- [x] T5 `ExportDialog`: `size="lg"`, replace data section with summary + "Editar datos".
- [x] T6 Verify: `node --test` studio libs, `pnpm lint`, `pnpm build:web`; docs/memory.

Verified: 2026-11-07 (eslint on runly.studio clean, 78 studio lib tests pass, pnpm build:web ok). Browser QA pending.
