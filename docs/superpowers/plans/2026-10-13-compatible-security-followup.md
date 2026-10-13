# Parches compatibles — plan

Date: 2026-10-13
Status: Complete — local scope; remaining alerts and operational acceptance pending
Spec: docs/superpowers/specs/2026-10-13-compatible-security-followup-design.md.

## Goal and architecture

Overrides exactos limitados al rango vulnerable, resolución real desde consumidores. Commit por familia después de baseline/fix/frozen/audit. Lockfile preserva otras resoluciones y pares.

## File Structure Map

Create: este spec/plan; scripts/tests/hono-adapter-security.test.mjs; scripts/tests/fast-uri-security.test.mjs; scripts/tests/valibot-security.test.mjs; docs/architecture/2026-10-13-compatible-security-followup-results.md.
Modify: package.json; pnpm-lock.yaml; docs/TASKS.md; docs/architecture/2026-10-13-stabilization-current-state.md; docs/superpowers/plans/2026-10-12-runly-stabilization.md.

## Tasks

- [x] Descubrimiento graph/source/metadata, targets y spec concreto.
- [x] Mode IMPLEMENTATION y commit documental 5c9f56dc.
- [x] Hono: baseline 2 pass/2 fail, corrected 4/4, frozen install/audit 27 → 25; 45b74cad.
- [x] fast-uri: baseline 1 pass/7 fail, corrected 8/8 con Ajv, frozen install/audit 25 → 17; 9908761a.
- [x] Valibot: baseline 1 pass/1 fail, corrected 2/2 con load de Prisma dev sin iniciar servidor, frozen install/audit 17 → 16; 05a97872.
- [x] Comparación estructural contra 5c9f56dc pasa; dirigidos 14/14, API 2404 pass/2 skip/0 fail, shared 1626 pass/7 skip/0 fail. Evidencia y límites registrados.
- [x] Privacy/secrets: 4,381 archivos, cero hallazgos; whitespace pasa. Trackers y cierre documental. Audit 16 continúa failing, sin excepciones.

Validation: node --test scripts/tests/hono-adapter-security.test.mjs scripts/tests/fast-uri-security.test.mjs scripts/tests/valibot-security.test.mjs; pnpm install --frozen-lockfile --ignore-scripts; pnpm audit --json; barridos API/shared según el programa.

Sin publicación, despliegue o conexión DB. Nuevas versiones/remediaciones fuera del mapa requieren scope separado.
