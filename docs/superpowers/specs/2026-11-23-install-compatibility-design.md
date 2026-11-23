# Install compatibility and publication diagnostics (Phase 4)

## 1. Feature title

Install compatibility, requirement reporting and clear publication diagnostics for Website templates (Hub, ERP, Atlas contract).

## 2. Status

Implemented and rehearsed, not published (2026-11-23). Folded into the single Phase 3 publication because the shared packages are still unpublished.

## 3. Context

Phases 1 to 3 added SVG media, synced components and motion/responsive props. A template that uses them cannot be opened by an installation that predates them. The evolution report asks that such a template declare what it needs and that the installation say so BEFORE installing, instead of showing incomplete content; and that publication errors name the missing image, SVG or capability.

## 4. Problem

1. The reader already fails closed (`builder_unsupported`, `catalog_digest_mismatch`) but says only "requires builder X"; the person cannot tell what an update would unlock.
2. Reviewers and listings see no summary of what a template uses.
3. Several Phase 1-3 error codes (synced components in release, SVG not publishable) have no user-facing copy, so the UI falls back to "Algo salió mal".
4. The install dialog hides the real reason when the template is incompatible.

## 5. Goals

1. The shared reader derives the requirements from the package (never from author-declared metadata, so they cannot lie): Builder version, asset policy and features SVG, synced components, motion, fluid type, focal point.
2. Compatibility errors include those features in the message and as structured `requirements`.
3. The Hub validation evidence carries a bounded `requirements` summary for reviewers and listings.
4. The ERP install dialog shows the real compatibility message and, when installable, what the template uses.
5. Every Phase 1-3 code reachable from publication or draft APIs has Spanish copy that names the cause and the action.

## 6. Non-goals

1. A new manifest field authors must fill in (requirements are derived).
2. Blocking installs on newer-but-compatible features (an installation that reads the template supports it by construction).
3. Marketplace search filters by feature (future).
4. Commerce wiring: product/cart/checkout blocks already resolve data through authorized ERP resources; nothing new is connected here.

## 7. User stories

1. As a person installing a template, I want to be told "usa imágenes SVG y animaciones; actualiza Runly" instead of a version number.
2. As a reviewer, I want to see what a submitted template uses without opening it.
3. As an editor publishing a site, I want a clear message when a component or image blocks publication.

## 8. UX requirements

Spanish copy; the dialog line "Esta plantilla usa ...; tu instalación ya lo admite."; errors show the first reader message verbatim.

## 9. Routes/screens

No new routes. Screens: Website marketplace install dialog; publication error banners (existing copy map).

## 10. Data model

`report.requirements = { builder, assetPolicy, features: [{ id, label }] }`, ids: `svg`, `components`, `motion`, `fluid-type`, `focal-point`.

## 11. Prisma impact

None.

## 12. API contract

No new endpoints. `POST .../marketplace/inspect` (existing) returns `validation.report.requirements` on success and `details.errors[0].message` with the feature sentence on `builder_unsupported` / `catalog_digest_mismatch`.

## 13. SDK contract

N/A.

## 14. Validator contract

`@runly/studio-interchange/website-requirements` (`describeRequirements`, `requirementsSentence`); reader attaches `requirements` to the two compatibility errors and to the report.

## 15. Module manifest impact

N/A.

## 16. Navigation impact

N/A.

## 17. Blueprint impact

N/A.

## 18. RBAC/permissions

Unchanged.

## 19. Multi-company behavior

Unchanged; requirements describe the package only.

## 20. Files/storage impact

None.

## 21. Export/import requirements

No format change. Older readers keep rejecting newer packages with their existing codes.

## 22. Audit log requirements

None.

## 23. Edge cases

1. Hostile or truncated page JSON while computing requirements: scanning is lenient and never throws; unparsable files contribute nothing.
2. A template using only features older readers support reports `features: []` and no sentence.
3. Look-alike values (`fluidType: false`, text equal to `_animation`) are not features.
4. Evidence is bounded (12 features, 80-char labels).

## 24. Risks

1. Message drift between hosts: one shared function builds the sentence.
2. Requirements omitting a future feature: the label table is the single place to extend, with a test per feature.

## 25. Acceptance criteria

1. Given a template with motion exported for a newer Builder, when an older installation inspects it, then the error code is `builder_unsupported` and the message ends with "Usa animaciones y efectos de movimiento. Actualiza Runly para usarla."
2. Given a plain template, then `requirements.features` is empty and no sentence is added.
3. Given the Hub validates a template, then the stored evidence contains the bounded requirements summary.
4. Given the ERP dialog receives a compatibility failure, then the person sees the reader message, not the generic one.
5. Given each Phase 1-3 code listed in the plan, then `describeCode` returns specific copy and never the generic fallback.

## 26. Verification plan

Interchange suite (`website-requirements.test.js`), Hub `tests/website-motion.test.js`, desktop `marketplace-import.test.js` and `synced-components.test.js`, then the Phase 3 rehearsal gates rerun with the rebuilt shared packages.

## 27. Rollback plan

Additive; remove the sentence and the evidence field by reverting the commits. No data involved.

## 28. Future enhancements

Marketplace listing filters and badges by feature; a pre-install "compatibility check" endpoint for fleets; per-feature minimum Runly versions in the catalog index.
