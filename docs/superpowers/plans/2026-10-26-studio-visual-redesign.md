# Plan — runly.studio visual redesign

Spec: `docs/superpowers/specs/2026-10-26-studio-visual-redesign-design.md`

1. Shell: `fullscreenPaths: ['/']` in `apps/api/src/manifests/official/studio.js`
   and in the `applyStudioBranding` projection (stale DB rows). Manifest test.
2. API: `preview`, `objectCount` and `q` in `studio-service.list`; route passes
   `q`. Postgres test covers preview + search.
3. `@runly/ui`: move `ToolButton`; canvas re-exports; document in
   `docs/ai-context/rme3-runtime-capabilities.md`.
4. Home: `lib/formats.js`, `StudioThumbnail`, `home/*` (hero, formats,
   templates, design card, skeletons), `StudioScreen` as router.
5. Editor: `editor/*` (top bar, export menu, rail + panels, context bar, zoom
   pill, layers), restyled inspector/resources/sharing/page dialog,
   `StudioWorkspace` layout, `DesignEditor` passes chrome into the workspace.
6. Verify: node tests for studio, lint, `pnpm build:web`, browser check at
   phone/tablet/desktop in light and dark.
