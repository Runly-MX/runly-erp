# Mercado template plan

1. Shared look + header, hero, categories in `mercadoBlocks.jsx`; picks, promos, reviews, newsletter, services, footer in `mercadoBlocks2.jsx`; `mercadoRegistry.js`.
2. Register in `runlyBlocks/index.js` (ecommerce group), add header/hero to `_effects.js` STATIC_TYPES.
3. `templates/mercadoTemplate.js` + theme in `templateThemes.js` + `runlyTemplates/index.js`.
4. Branding: header/footer types in `website-template-branding.js`; ProductsGrid reads `?q=`/`?c=`.
5. `node scripts/generate-website-block-catalog.mjs`, conform test, SSR render check, commit.
