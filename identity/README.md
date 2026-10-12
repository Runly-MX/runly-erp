# Identity Assets

This directory preserves the historical Atlas ERP brand resources. The `runly-erp_*`
filenames were renamed during migration, but the artwork remains the Atlas A.

Current Runly branding is in `apps/desktop/public/runly/`. Native builds use
`runly-isotipo-dark.png` and `runly-app-icon-dark.png` there. Do not regenerate the
Android app from this legacy directory. See `docs/10_brand_assets_strategy.md`.

## Canonical sources

- `runly-erp_app_icon.png`: master icon source used to generate Tauri and web icons.
- `runly-erp_primary_logo.png`: main square logo variant.
- `runly-erp_horizontal_logo.png`: horizontal logo for metadata/share cards.
- `runly-erp_vertical_logo.png`: vertical logo variant.
- `runly-erp_isotype_only.png`: symbol-only variant.
- `runly-erp_monochrome_light.png`: monochrome for dark backgrounds.
- `runly-erp_monochrome_dark.png`: monochrome for light backgrounds.

## Official color palette

```css
:root {
  --runly-navy: #0A1D44;
  --runly-navy-2: #102A5E;
  --runly-navy-dark: #06152F;
  --runly-blue: #0A7BFF;
  --runly-cyan: #21C7FF;
  --runly-gray-light: #E6EAF0;
  --runly-gray-text: #5F6B7A;
}
```

Use this as the canonical Atlas ERP palette across web, desktop, and brand collateral.

## Build flow

Run:

```bash
pnpm brand:build
```

This command will:

1. Regenerate desktop icon bundles in `apps/desktop/src-tauri/icons`.
2. Regenerate transparent brand PNG variants in `apps/desktop/public/brand` from the master files in `identity/`.
3. Refresh metadata-related files (`favicon`, `manifest`, `og-image`).

## SVG guidance

If SVG masters are available, store them alongside the PNG assets using the same base names.
Keep PNG files as production fallbacks until the full SVG export pipeline is added.
