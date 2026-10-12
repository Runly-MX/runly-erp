# 10 - Brand Assets Strategy

Runly's brand lives in `apps/desktop/public/runly/`. The older Atlas "A" artwork, its
`identity/` folder, `apps/desktop/public/brand/` and the `brand:build` / `icons:generate`
generators were retired on 2026-10-12; nothing in the product should reference them.

## Source of truth

`apps/desktop/public/runly/` holds the current masters:

- `runly-isotipo-light.png` (navy R, for light surfaces) and `runly-isotipo-dark.png` (white R, for dark surfaces)
- `runly-isotipo-alter-blue.png` (single-color navy R)
- `runly-logo-light.png` / `runly-logo-dark.png` (square logo)
- `runly-logo-horizontal-light.png` / `runly-logo-horizontal-dark.png`
- `runly-logo-vertical-light.png` / `runly-logo-vertical-dark.png`
- `runly-app-icon-light.png` / `runly-app-icon-dark.png` (app icons)
- `web/` (favicon, apple-touch-icon, 192/512 and maskable icons), `android/`, `ios/`

Pick the `-dark` variant on dark backgrounds (kiosk, login hero, dark theme) and `-light`
on light ones. Color tokens are in `packages/ui/src/runtime.css`.

Browser metadata icons in `apps/desktop/public` (`favicon.ico`, `favicon-32x32.png`,
`apple-touch-icon.png`, `icon-192.png`, `icon-512.png`, `og-image.png`, `site.webmanifest`)
are committed files; replace them by hand when the identity changes. `apps/desktop/index.html`
wires them with `description`, `theme-color`, favicon and webmanifest links and the Open Graph
and Twitter share tags.

## Server-side uses

- `GET /brand/:filename` (API) is kept only so e-mails already sent and cached URLs keep
  working. It maps the legacy file names onto the current assets above.
- PDF watermarks and e-mail headers read from `apps/desktop/public/runly/`.

## Native Android host

`pnpm brand:native` uses the installed Tauri icon CLI and the current Runly PNG masters in
`apps/desktop/public/runly/`. Temporary SVG wrappers preserve the original artwork,
provide the `#070D18` background and produce a monochrome alpha silhouette for Android
13 themed icons. Tauri exports all density variants and adaptive icon resources.

The command regenerates the Android launcher resources. They are ignored and removed
from version control: `mipmap-*/ic_launcher*.png`, the two adaptive icon XML files, and
`values/ic_launcher_background.xml`. Intermediate exports go to ignored `.tmp/native-brand/`.
The recovery UI imports the current Runly master directly, so it does not duplicate a
generated logo. Native builds execute the generator before packaging.

Keep the master logos, Kotlin source, Gradle wrapper/configuration, manifest, themes
and string resources in Git: they contain custom behavior and cannot be reconstructed
from the logo masters. Build directories, Kotlin/Gradle caches, compiled libraries,
APK/AAB files, secrets and per-machine settings remain ignored. On a fresh checkout
use the native wrapper, or run `pnpm brand:native` before invoking Gradle directly.

Android startup uses `androidx.core:core-splashscreen:1.2.0` with the same mark/background and a normal transition into Tauri. It does not add a second Activity or artificially delay loading. The recovery shell remains responsible for network errors after startup. iOS icon exports can be generated, but iOS launch-screen integration still requires the pending Xcode project.

References: [Tauri icon generator](https://v2.tauri.app/develop/icons/) and [Android SplashScreen migration](https://developer.android.com/develop/ui/views/launch/splash-screen/migrate).
