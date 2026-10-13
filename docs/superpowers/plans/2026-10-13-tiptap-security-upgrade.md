# Tiptap: plan de actualización coordinada

Date: 2026-10-13
Status: Complete — local dependency scope; operational acceptance and Notes diagnostics pending
Spec: docs/superpowers/specs/2026-10-13-tiptap-security-upgrade-design.md.

## File Structure Map

Create: este spec/plan; scripts/tests/tiptap-security.test.mjs; docs/architecture/2026-10-13-tiptap-security-results.md y .json.
Modify: apps/desktop/package.json; pnpm-lock.yaml; scripts/fixtures/security/prosemirror-clipboard.mjs; scripts/tests/prosemirror-clipboard-security.test.mjs; docs/TASKS.md; docs/architecture/2026-10-13-stabilization-current-state.md; docs/superpowers/plans/2026-10-12-runly-stabilization.md.
No módulos de producto, schema, cliente Supabase, CI o contenido persistido modificados.

## Task 1 — Descubrimiento [COMPLETE]

- [x] Graph, source consumers y advisories primarios; 43 paquetes 3.30.5 disponibles.
- [x] Mínimos y-tiptap/model identificados; linkifyjs existente ya satisface versión mínima.
- [x] Scope y file map concretos; autorización de continuación vigente.

## Task 2 — Pruebas

- [x] Baseline final: 4 tests, 1 pass/3 fail (prototipo heredado y ambos parsers exceden 3 s). Inputs via stdin para respetar límite Windows; errores de fixture iniciales corregidos antes de registrar baseline.
- [x] Chrome DOMSerializer, clipboard/Notes, EditorContent React y dos Y.Doc en memoria con undo/redo/roundtrip pasan; no proveedor Realtime real.

## Task 3 — Paquetes

- [x] 21 directos exactos, 43 paquetes 3.30.5, y-tiptap 3.0.7/model 1.25.11 y peers; otras versiones preservadas.
- [x] Frozen install y comparación estructural de YAML/manifiesto pasan contra 74dff345; sin resoluciones ajenas.
- [x] Seguridad/browser 5/5; audit 27 (0 críticas, 13 altas, 13 moderadas, 1 baja), sin core alertado. Commit de familia.

## Task 4 — Cierre

- [x] Shared 1617 pass/7 skip/0 fail, build web pasan; React Doctor completo registra un error previo y cinco warnings, no revisión limpia. Privacidad/secrets/whitespace verificados al cierre.
- [x] Evidence JSON/Markdown y trackers; proveedor real, imágenes y autoguardado pendientes separados. Commit de cierre documental tras checks.
