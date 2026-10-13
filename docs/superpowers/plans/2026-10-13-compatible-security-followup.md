# Parches compatibles — plan

Date: 2026-10-13
Status: In Progress
Spec: docs/superpowers/specs/2026-10-13-compatible-security-followup-design.md.

## Goal and architecture

Overrides exactos limitados al rango vulnerable, resolución real desde consumidores. Commit por familia después de baseline/fix/frozen/audit. Lockfile preserva otras resoluciones y pares.

## File Structure Map

Create: este spec/plan; scripts/tests/hono-adapter-security.test.mjs; scripts/tests/fast-uri-security.test.mjs; scripts/tests/valibot-security.test.mjs; docs/architecture/2026-10-13-compatible-security-followup-results.md.
Modify: package.json; pnpm-lock.yaml; docs/TASKS.md; docs/architecture/2026-10-13-stabilization-current-state.md; docs/superpowers/plans/2026-10-12-runly-stabilization.md.

## Tasks

- [x] Descubrimiento graph/source/metadata, targets y spec concreto.
- [ ] Mode IMPLEMENTATION y commit documental.
- [ ] Hono baseline/fix, frozen/audit y commit.
- [ ] fast-uri baseline/fix, Ajv, frozen/audit y commit.
- [ ] Valibot baseline/fix, load consumer, frozen/audit y commit.
- [ ] Comparación estructural contra source base, dirigidos/API/shared y evidencia.
- [ ] Privacy/secrets/whitespace y trackers, cierre documental.

Validation: node --test scripts/tests/hono-adapter-security.test.mjs scripts/tests/fast-uri-security.test.mjs scripts/tests/valibot-security.test.mjs; pnpm install --frozen-lockfile --ignore-scripts; pnpm audit --json; barridos API/shared según el programa.

Sin publicación, despliegue o conexión DB. Nuevas versiones/remediaciones fuera del mapa requieren scope separado.
