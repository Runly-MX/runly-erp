# 10 - Brand Assets Strategy

This document records the legacy Atlas asset pipeline and the current Runly native branding flow.

## Source of truth

Current Runly masters are in `apps/desktop/public/runly/`: the native host uses
`runly-isotipo-dark.png` and `runly-app-icon-dark.png`. `identity/runly-erp_*`
contains historical Atlas artwork; those filenames do not make it current Runly branding.

## Official color palette

Historical Atlas palette (current Runly tokens are in `packages/ui/src/runtime.css`):

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

Usage guideline:

- `--runly-cyan`: primary interactive accent (sidebar active, CTAs, highlights).
- `--runly-blue`: secondary brand accent and hover state.
- `--runly-navy` / `--runly-navy-2` / `--runly-navy-dark`: dark surfaces and gradients.
- `--runly-gray-light` / `--runly-gray-text`: neutrals for background and text balance.

Required baseline files:

- `runly-erp_app_icon.png`
- `runly-erp_primary_logo.png`
- `runly-erp_horizontal_logo.png`
- `runly-erp_vertical_logo.png`
- `runly-erp_isotype_only.png`
- `runly-erp_monochrome_light.png`
- `runly-erp_monochrome_dark.png`

## Build command

Run:

```bash
pnpm brand:build
```

What it does:

1. Runs `pnpm tauri icon` using `identity/runly-erp_app_icon.png`.
2. Regenerates platform icons in `apps/desktop/src-tauri/icons`.
3. Rebuilds transparent brand PNGs in `apps/desktop/public/brand` from `identity/`.
4. Copies normalized static files to `apps/desktop/public` for browser metadata.
5. Updates `apps/desktop/public/site.webmanifest`.

## Generated outputs

### Native Android host

`pnpm brand:native` uses the installed Tauri icon CLI and the current Runly PNG masters in
`apps/desktop/public/runly/`. Temporary SVG wrappers preserve the original artwork,
provide the `#070D18` background and produce a monochrome alpha silhouette for Android
13 themed icons. Tauri exports all density variants and adaptive icon resources.

The command regenerates the Android launcher resources. They are ignored and removed
from version control: `mipmap-*/ic_launcher*.png`, the two adaptive icon XML files, and
`values/ic_launcher_background.xml`. Intermediate exports go to ignored `.tmp/native-brand/`.
The recovery UI imports the current Runly master directly, so it does not duplicate a
generated logo. Native builds execute the generator before packaging; `brand:build`
runs it last so its historical raster flow cannot overwrite mobile branding.

Keep the master logos, Kotlin source, Gradle wrapper/configuration, manifest, themes
and string resources in Git: they contain custom behavior and cannot be reconstructed
from the logo masters. Build directories, Kotlin/Gradle caches, compiled libraries,
APK/AAB files, secrets and per-machine settings remain ignored. On a fresh checkout
use the native wrapper, or run `pnpm brand:native` before invoking Gradle directly.

Android startup uses `androidx.core:core-splashscreen:1.2.0` with the same mark/background and a normal transition into Tauri. It does not add a second Activity or artificially delay loading. The recovery shell remains responsible for network errors after startup. iOS icon exports can be generated, but iOS launch-screen integration still requires the pending Xcode project.

References: [Tauri icon generator](https://v2.tauri.app/develop/icons/) and [Android SplashScreen migration](https://developer.android.com/develop/ui/views/launch/splash-screen/migrate).

`apps/desktop/public`:

- `favicon.ico`
- `favicon-32x32.png`
- `apple-touch-icon.png`
- `icon-192.png`
- `icon-512.png`
- `og-image.png`
- `site.webmanifest`

`apps/desktop/public/brand`:

- `runly-logo-primary.png`
- `runly-logo-horizontal.png`
- `runly-logo-vertical.png`
- `runly-logo-isotype.png`
- `runly-logo-monochrome-light.png`
- `runly-logo-monochrome-dark.png`

## Metadata wiring

`apps/desktop/index.html` includes:

- `description`
- `theme-color`
- favicon and webmanifest links
- Open Graph tags (`og:title`, `og:description`, `og:image`)
- Twitter share tags (`twitter:card`, `twitter:title`, `twitter:description`, `twitter:image`)

## Next optional upgrades

- Add SVG masters for all canonical variants.
- Add a dedicated 1200x630 social card image export for `og-image.png`.
- Add `application/ld+json` Organization metadata once production domain is finalized.
