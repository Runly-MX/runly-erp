# Plan: Studio crear en lote

Spec: `docs/superpowers/specs/2026-11-06-studio-bulk-create-design.md`

1. `apps/desktop/src/modules/runly.studio/lib/studio-bulk.js` (pure): `designFields`,
   `fillDocument`, `autoMapping`, `rowValues` + test.
2. API `apps/api/src/routes/studio/studio-data-source.js` (`parseStudioDataFile`) +
   route `POST /studio/data-sources/parse` + test; SDK `parseDataSource`.
3. `fabric-adapter.js`: `exportVariant(pageId, reviewed, variant, format, quality, settings)`
   renders a substituted document offscreen after asserting the reviewed scene.
4. `studio-export.js`: `exportBulk` (ZIP via jszip, PDF via jspdf).
5. UI: `BulkDataSection.jsx` inside `ExportDialog`; `DesignEditor` routes
   `options.bulk` and provides `readFields` / `onInsertField` through `chrome`.
6. Verify: unit tests, lint, `pnpm build:web`.
