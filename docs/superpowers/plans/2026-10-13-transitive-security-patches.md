# Parches transitivos: ejecución por familia

Date: 2026-10-13
Status: In Progress
Spec: docs/superpowers/specs/2026-10-13-transitive-security-patches-design.md.

## File Structure Map

Create:
- Este spec/plan.
- scripts/tests/source-map-security.test.mjs.
- scripts/tests/lodash-es-security.test.mjs.
- scripts/tests/prosemirror-clipboard-security.test.mjs.
- scripts/fixtures/security/prosemirror-clipboard.mjs.
- docs/architecture/2026-10-13-transitive-security-results.md y .json.

Modify:
- package.json: overrides limitados al rango afectado.
- pnpm-lock.yaml: resoluciones e integridades verificadas; peers necesarios.
- docs/TASKS.md.
- docs/superpowers/plans/2026-10-12-runly-stabilization.md.
- docs/architecture/2026-10-13-stabilization-current-state.md.

## Task 1 — Descubrimiento [COMPLETE]

- [x] Graph primero para consumidores; sin resultados SourceMap, revisar dependencia transitoria/configuración como fallback.
- [x] Consultar advisories primarios, metadata npm y copias instaladas.
- [x] Comparar patch source-map y clipboard del tarball verificado; sin ejecutar payloads reales.

## Task 2 — source-map-js [COMPLETE]

- [x] Fixture negativo de offsets con consumidores Tailwind/PostCSS y roundtrip válido.
- [x] Baseline 3/7; corregido 7/7. Override/lock sólo de la familia; frozen install pasa.
- [x] Bundler/compiler 21/21; audit 33 (0 críticas, 16 altas, 16 moderadas, 1 baja). Commit con evidencia local.

## Task 3 — lodash-es

- [ ] Resolver copia Mermaid/Chevrotain; fixtures imports/path y utilidades normales.
- [ ] Baseline; reutilizar 4.18.1 existente; frozen install; pruebas/bundle y audit.
- [ ] Commit de familia.

## Task 4 — prosemirror-view

- [ ] Fixture EditorView real: contexto clipboard válido e inválido, pegado ordinario y edición/serialización.
- [ ] Baseline; override/lock/peer references 1.42.3; frozen install; Chrome/pruebas/audit.
- [ ] Commit de familia.

## Task 5 — Verificación y cierre

- [ ] Build web y suites pertinentes de Notes/Canvas/compiler/runtime; secretos, privacidad y diff.
- [ ] Comparación estructural del lockfile: ninguna resolución ajena cambia.
- [ ] JSON/Markdown con versiones, conteos, evidencia y límites; tracker actualizado y commit.

CI, B2 real y transporte permanecen diferidos. No publicación, push o deployment.
