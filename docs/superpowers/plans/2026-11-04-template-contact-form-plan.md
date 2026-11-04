# Template contact form (plan)

Spec: `docs/superpowers/specs/2026-11-04-template-contact-form-design.md`

- [x] `website-template-forms.js`: placeholder helpers (`usesContactForm`, `bindContactForm`) and `ensureContactForm`.
- [x] Wire into `website-template-service.js` inside the apply transaction, with the permission fallback.
- [x] Unit tests for the helpers.
- [x] Add the form block to the Contacto page of Maya Studio, Aurora Viajes and Finora.
- [ ] Verify against a disposable database: apply, edit the form from the Forms screen, publish, submit from the public page.
- [ ] Other built-in templates (restaurante, spa, tienda, agencia, negocio, habitia) get the same block when redesigned.
