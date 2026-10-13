# Tiptap: plan de actualización coordinada

Date: 2026-10-13
Status: In Progress
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

- [ ] Regresiones de mergeAttributes y parsers acotados, baseline.
- [ ] Fixture Chrome con DOMSerializer y sincronización local de Y.Doc; smoke normal existente.

## Task 3 — Paquetes

- [ ] Actualizar directos exactos y 43 paquetes de familia, y-tiptap/model mínimos y peers.
- [ ] Frozen install, inventario y comparación estructural de YAML; ninguna versión ajena.
- [ ] Seguridad/browser/audit; commit de cambio de familia.

## Task 4 — Cierre

- [ ] Shared/build/React Doctor/privacidad/secrets/whitespace.
- [ ] Evidence JSON/Markdown y trackers, límites operativos y commit.
