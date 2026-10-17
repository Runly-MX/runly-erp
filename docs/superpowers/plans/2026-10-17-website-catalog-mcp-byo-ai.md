# Plan: Website + Catálogo por MCP (BYO-AI)

Spec: `docs/superpowers/specs/2026-10-17-website-catalog-mcp-byo-ai-design.md`

1. [ ] Block catalog: `scripts/generate-website-block-catalog.mjs` (Vite SSR from
   `apps/desktop`) -> `apps/api/src/routes/website/block-catalog.json`; freshness test.
2. [ ] `apps/api/src/routes/website/page-document.js`: `sectionsToDocument`,
   `documentToSections`, strict validation; unit tests.
3. [ ] Files: `visibility` filter in `GET /files`; editor asset picker lists
   PUBLIC images only.
4. [ ] MCP adapter `runly.website` (queries + `site.setup`, `pages.draft`,
   `pages.publish`); registry passes `supabaseAdmin`.
5. [ ] MCP adapter `runly.catalog` (products/categories).
6. [ ] Attachment targets `website.site` and `catalog.product` (PUBLIC);
   file-import effects text reflects public storage.
7. [ ] Scopes, desktop domain labels, contract tests, regenerate
   `docs/integrations/RUNLY_MCP_CATALOG.md`, update MCP docs.
8. [ ] Verify: `node --test apps/api/src/mcp/__tests__/ apps/api/src/routes/website/__tests__/`,
   `pnpm lint`, real API boot + MCP `tools/list`.
