# Parches transitivos: ejecución por familia

Date: 2026-10-13
Status: Complete (local verification)
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

## Task 3 — lodash-es [COMPLETE]

- [x] Resolver copia Mermaid/Chevrotain; baseline 2/6: imports y ambos paths fallan, utilidades/parser normal pasan.
- [x] Reutilizar 4.18.1 existente; frozen pasa. Corregido 6/6; añadido control de bundle browser con esbuild, total 7/7. Audit 30 (0 críticas, 15 altas, 14 moderadas, 1 baja).
- [x] Commit de familia; sin actualizar Excalidraw/Mermaid o las demás resoluciones.

## Task 4 — prosemirror-view [COMPLETE]

- [x] Fixture EditorView real: baseline falla por array aceptado como atributo string en contexto clipboard. Corregido 1/1; cuatro tipos inválidos rechazados, texto/formato y contexto válido conservados.
- [x] Añadido smoke con buildExtensions de Notes y Editor Tiptap reales: pegado, formato, tabla, undo/redo y roundtrip pasan. CSS excluido sólo del fixture lógico; colaboración/redes/plugin de imágenes no aceptados por este test.
- [x] Override/lock/peer references 1.42.3; frozen pasa. Audit 29 (0 críticas, 14 altas, 14 moderadas, 1 baja); Tiptap/core conserva alertas independientes. Commit de familia.

## Task 5 — Verificación y cierre

- [x] Build web y barridos acotados API/shared, incluyendo Notes/Canvas/compiler/runtime; controles finales de secretos, privacidad y diff.
- [x] Comparación estructural del lockfile y manifiesto: ninguna resolución ajena cambia.
- [x] JSON/Markdown con versiones, conteos, evidencia y límites; tracker actualizado y commit de cierre.

Regresión: API 2367 tests, 2365 pass/2 skip/0 fail (222.34 s); shared 1624 tests, 1617 pass/7 skip/0 fail (200.86 s). Node 22.12.0, concurrency 8, timeout 60000 ms, force-exit; globs y omisiones iguales al regression-ledger. Nuevos scripts/tests/*.mjs ejecutados por separado, 15/15. No opt-ins de servicios reales.

CI, B2 real y transporte permanecen diferidos. No publicación, push o deployment.
