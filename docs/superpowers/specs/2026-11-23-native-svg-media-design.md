# Native SVG media (Phase 0 + Phase 1)

Status: draft for approval. Source: evolution report of 2026-11-23 (KYNTRA). Scope here is only
Phase 0 (regression baseline) and Phase 1 (SVG foundation). Design system, Motion Engine, Responsive Pro,
Marketplace compatibility and KYNTRA certification are separate specs.

## Verified current state (2026-11-23)

- Hub storage whitelist: `packages/contracts/media.js` (`MEDIA_MIMES` = png/jpeg/webp/gif;
  `DOCUMENT_IMAGE_MIMES` = png/jpeg/webp). Magic-byte sniffing in `imageMime()` has no SVG branch.
- Hub upload flow: `apps/api/src/services/marketplace-resources/media.js` (prepare -> PUT to quarantine ->
  confirm). Confirm runs the sandboxed validator (`marketplace-validation/child.mjs`, kind `media_asset`),
  which decodes with sharp and emits WebP `thumbnail`/`optimized` variants. Variants are hard-coded to
  `mime: 'image/webp'`.
- MCP output schemas pin `mime` to raster enums: `apps/api/src/mcp/output-schemas.js` (lines 16, 72) and
  `apps/api/src/mcp/studio-tools.js` (line 7).
- Portable Website package (this repo): `packages/studio-interchange/src/website-template.js`
  (`WEBSITE_ASSET_POLICY = packaged-raster-v1`, header states "no SVG admitted") and
  `src/inspect.js` (`validateImage` signature check allows only png/jpeg/webp; manifest `resource.mime` enum
  and the `{png,jpg,webp}` extension map).
- Atlas Web Builder (`d:\RacoonDevs\atlas-web-builder`, package `@raulbellosom/atlas-web-builder`, 0.9.0
  consumed by Hub) is out of this repo; its image element/Inspector must be inspected before its part is
  designed. Not read for this draft.

## Decisions

1. **New policy, old readers kept.** Add `packaged-media-v2` (`{name, version: 2}`) = raster v1 + `image/svg+xml`.
   `packaged-raster-v1` stays readable and writable; a document that references no SVG keeps emitting v1,
   so SENDA and historical templates are byte-identical on round trip. Only documents that contain an
   SVG declare v2. A v1-only reader rejects v2 with the existing `format_unsupported`-style error instead of
   dropping the asset silently.
2. **Sanitize, never trust.** One pure module `sanitizeSvg(bytes, limits)` in `packages/studio-interchange`
   (shared by Hub validator and the ERP importer; Hub consumes it through the same published/linked package
   path used for `studio-interchange` today). Allowlist parser (not regex):
   - Allowed elements: svg, g, defs, path, rect, circle, ellipse, line, polyline, polygon, text, tspan,
     linearGradient, radialGradient, stop, clipPath, mask, use (fragment `#id` only), title, desc, symbol.
   - Drop: script, foreignObject, style (v1 of this policy: no CSS), image, a, animate*, set, filter with
     external refs, every `on*` attribute, any `href`/`xlink:href` not starting with `#`, any `url()` not
     `url(#id)`, DOCTYPE/ENTITY/processing instructions (XXE and billion-laughs), XML comments.
   - Limits: 256 KiB source, 5 000 elements, depth 32, `viewBox` required and finite, width/height
     normalized to the viewBox (no fixed pixel size authority).
   - Output is the re-serialized sanitized tree; the stored master is the sanitized bytes, and the SHA-256
     recorded is of the stored bytes. The raw upload hash is kept in provenance for dedupe messaging.
3. **Recolor contract.** A sanitized SVG may mark recolorable paints with `fill="currentColor"` /
   `stroke="currentColor"`; the asset records `properties.svg = {viewBox, width, height, recolorable: bool}`.
   Inspector recoloring (Atlas) sets CSS `color` on the element; no inline style rewriting of the SVG.
4. **Previews.** Validator renders `thumbnail`/`optimized` WebP from the sanitized SVG with sharp at fixed
   sizes; the vector master is never replaced. Variants stay `image/webp`.
5. **Serving.** SVG is served only as a download/`<img>`/CSS-image resource with
   `Content-Type: image/svg+xml`, `Content-Security-Policy: default-src 'none'; style-src 'none'; sandbox`,
   `X-Content-Type-Options: nosniff`. Atlas/ERP render it through `<img src>` (no inline DOM injection), so a
   sanitizer bug cannot execute script in the app origin. Inline rendering is out of scope.
6. **Scopes.** `DOCUMENT_IMAGE_MIMES` gains `image/svg+xml` only through the v2 policy flag, so Studio
   (`hub:studio:write`) is unchanged until Studio documents are specified for SVG. Website scope gets it.
7. **Errors.** Distinct stable codes: `SVG_INVALID_XML`, `SVG_FORBIDDEN_CONTENT` (list of removed/offending
   constructs in `details`, never echoed raw), `SVG_TOO_COMPLEX`, `SVG_NO_VIEWBOX`, plus existing
   `MEDIA_INTEGRITY`, `PUBLISHER_STORAGE_QUOTA`. Sanitization that only strips safe-to-drop constructs
   succeeds with `warnings`; forbidden active content is a hard reject (not silent cleaning) so malicious
   uploads are visible.
8. **MCP.** `runly_website_asset_prepare|confirm|from_chatgpt` and `runly_media_asset_*` accept the new MIME;
   output schemas widened; `runly_website_contract` advertises `assetPolicies: ['packaged-raster-v1',
   'packaged-media-v2']` and `svg: {maxBytes, recolor: 'currentColor'}`. No base64 path added.
9. **Magic bytes.** SVG has no signature: detection is "UTF-8 text whose first non-BOM/whitespace token is
   `<?xml` or `<svg`", then full parse. A declared `image/svg+xml` that fails parsing is rejected; an
   undeclared SVG sent as another MIME stays rejected by the existing signature check.

## Phase 0 (before any code in Phase 1)

- Snapshot test: round-trip (export -> inspect -> import) of SENDA and every existing Website fixture must
  stay byte-identical with policy v1 after Phase 1 lands. Pin their digests now.
- Add a hostile-SVG corpus (script, onload, foreignObject, external href, XXE, entity bomb, huge path,
  nested `use` loop, no viewBox, `data:` href, `javascript:` href, CSS `@import`) as test fixtures; all
  must reject with the specific code above.

## Out of scope here

Atlas element/Inspector, Motion Engine, fluid type, Marketplace compatibility gating, KYNTRA content,
SVG node editing, Studio SVG, animated SVG (SMIL/CSS is dropped by the sanitizer by design).

## Verification

- `node --test` for sanitizer corpus + policy round-trip in `packages/studio-interchange`.
- Hub: integration test extending `tests/integration/media-library.test.js` (prepare -> upload -> confirm
  SVG, dedupe by hash, variant WebP, hostile reject codes) and MCP schema tests.
- ERP: Website import of a v2 package with an SVG; v1 reader rejection message.
- Real check: upload one clean logo SVG to a disposable Hub stack and open it through Atlas once Atlas
  support exists (Phase 1 final step, separate from Hub/ERP completion).

## Open points (need the owner's call; defaults chosen)

- No `<style>`/CSS in SVG (default: dropped; a logo using classes must be exported with attributes).
- Rendering via `<img>` means `currentColor` recolor does not cross the image boundary. Default: recolor
  works by swapping to a CSS `mask-image` rendering for recolorable icons; plain `<img>` for logos. Atlas
  spec decides the exact mechanism.
