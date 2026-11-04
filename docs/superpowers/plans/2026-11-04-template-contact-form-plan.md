# Template contact form (plan)

Spec: `docs/superpowers/specs/2026-11-04-template-contact-form-design.md`

- [x] `website-template-forms.js`: placeholder helpers (`usesContactForm`, `bindContactForm`) and `ensureContactForm`.
- [x] Wire into `website-template-service.js` inside the apply transaction, with the permission fallback.
- [x] Unit tests for the helpers.
- [x] Add the form block to the Contacto page of Maya Studio, Aurora Viajes and Finora.
- [x] Verify against a disposable database: apply, publish, submit from the public page. Verified: 2026-11-04 (scripts/test-website-postgres.mjs --postgres17 --templates-only: 12 tests pass; all 9 templates apply, provision forms, pass preflight, activate a release and publish every route; a real submission is captured; the form and brand of one site never leak into the next). Editing the form from the Forms screen was not exercised.
- [ ] Other built-in templates (restaurante, spa, tienda, agencia, negocio, habitia) get the same block when redesigned.
