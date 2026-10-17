# Plan: Website + Catálogo por MCP (BYO-AI)

Spec: `docs/superpowers/specs/2026-10-17-website-catalog-mcp-byo-ai-design.md`

1. [x] Block catalog: `scripts/generate-website-block-catalog.mjs` (Vite SSR from
   `apps/desktop`) -> `apps/api/src/routes/website/block-catalog.json`; freshness test.
   Verified: 2026-10-17 (36 blocks generated; every block's sections parse with the real `parsePage`).
2. [x] `apps/api/src/routes/website/page-document.js`: `sectionsToDocument`,
   `documentToSections`, strict validation; unit tests.
   Verified: 2026-10-17 (`page-document.test.js` 3/3).
3. [x] Files: `visibility` filter in `GET /files`; editor asset picker lists
   PUBLIC images only. Extra fixes found while auditing Files: storefront
   `image_url` was never returned by the public catalog; product images
   uploaded as the uploader's private Files.
   Verified: 2026-10-17 (catalog + public-catalog-router tests 22/22).
4. [x] MCP adapter `runly.website` (queries + `site.setup`, `pages.draft`,
   `pages.publish`); registry passes `supabaseAdmin`.
5. [x] MCP adapter `runly.catalog` (products/categories).
6. [x] Attachment targets `website.site` and `catalog.product` (PUBLIC, images
   only); file-import effects text reflects public storage.
7. [x] Scopes, desktop domain labels, contract tests, regenerated
   `docs/integrations/RUNLY_MCP_CATALOG.md`, updated MCP docs.
   Verified: 2026-10-17 (`node --test apps/api/src/mcp/__tests__/*.test.js` 29/29, eslint clean on changed paths, dev API reloaded with /health ok).
8. [ ] E2E against the dev DB in the test company: `.e2e/website-mcp-e2e.mjs`
   (queries, deterministic prepare, execute, builder parse, HTTP checks, cleanup).
   Blocked 2026-10-17: the machine ran out of virtual memory (dev Vite process at ~7 GB).

## Next phases (not in this plan)

- "Sección libre" HTML/Tailwind block (sanitized) for more creative layouts.
- Full-code sites: assistant uploads the static `dist` ZIP through MCP.
- "Copiar prompt / importar JSON" for users without an MCP-capable plan.
- Inline preview in the chat (ChatGPT Apps SDK / MCP Apps).
