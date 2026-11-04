# Plan: Tienda store gaps

1. `storeNavbarBlock.jsx` + register in `runlyBlocks/index.js` (ecommerce) and `_effects.js` STATIC_TYPES; branding applies name.
2. `website-template-forms.js` placeholder table + `ensureTemplateForm`; template service binds per placeholder; tests.
3. `ContactFormRenderer` compact single-field layout; Tienda template newsletter section.
4. `checkout-routes.js` `allow_promotion_codes`; test; `CartPageBlock.promoNote`.
5. Verify: template prop/option check, `node --test` website suites, render at 1280/390, `vite build`.
