# Plan: Studio module data sources, codes and label sizes

Spec: `docs/superpowers/specs/2026-11-06-studio-module-data-labels-design.md`

1. API `studio-data-providers.js` (Inventario, Flota) + `GET /studio/data-sources`,
   `POST /studio/data-sources/:key/rows` + test; SDK `dataSources`, `dataSourceRows`.
2. `lib/studio-codes.js`: QR (qrcode) and Code 128 B geometry + test; document schema
   `vector.code`, operations key `code`, credits skip generated codes.
3. `studio-bulk.js`: code values as fields, geometry regenerated per row.
4. Editor: "Códigos y campos" in the Texto panel, `CodeContentField` in the inspector,
   vector rebuild when geometry changes.
5. Label sizes: `page.ppi` (schema, ops, new pages inherit it, `defaultPpi`), label
   formats (300 ppp) on the home and in "Formato".
6. `ModuleSourcePicker` inside "Datos para varias versiones".
7. Verify: unit tests, lint, web build, read-only provider run against the E2E company.
