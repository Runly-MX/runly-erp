---
description: "Apply when creating or editing animated logo components, brand loaders, SVG isotypes, splash screens, or any component in apps/desktop/src/components/ that references apps/desktop/public/runly/ assets or brand/ files."
applyTo: "apps/desktop/src/components/AtlasLogo*.jsx, apps/desktop/src/components/*Loader*.jsx, apps/desktop/src/components/*Splash*.jsx"
---

# Logo Component Rules — Runly ERP

## The Golden Rule

**Never approximate SVG path geometry.** If you do not have a real traced SVG file, stop and ask for one.

Clip-paths on `<img>` tags and manually estimated polygon coordinates are always wrong — they produce gaps, misaligned edges, and shapes that don't match the logo. The only acceptable source of path data is a traced SVG (from Inkscape, vectorizer.io, or an existing `.svg` file in `apps/desktop/public/runly/`).

## Source of Truth for Logo Assets

| Asset | Location |
|---|---|
| Traced SVG (isotype) | `apps/desktop/public/runly/runly-isotipo-light.svg` (create if missing) |
| PNG fallback | `apps/desktop/public/runly/runly-isotipo-light.png` |
| Runtime SVG | `apps/desktop/public/runly/runly-isotipo-light.svg` |
| Runtime PNG | `apps/desktop/public/runly/runly-isotipo-light.png` |

Always prefer the SVG over the PNG for animated components.

## Runly Isotype Structure

The Runly isotype is a **3-face isometric "A" arch**. Each face is a separate `<path>`:

| Face | Fill | CSS Token | Animation entry direction |
|---|---|---|---|
| Top/roof | `#0A1D44` | `--runly-navy` | From above (y: -N → 0) |
| Left pillar | `#102A5E` | `--runly-navy-2` | From bottom-left (x: -N, y: +N → 0,0) |
| Right pillar | `#21C7FF` | `--runly-cyan` | From bottom-right (x: +N, y: +N → 0,0) |

Only the **right (cyan) face** gets a glow filter. The other two get a drop shadow.

## Motion Library

```js
// CORRECT
import { motion, useReducedMotion } from "motion/react";

// WRONG — do not use
import { motion } from "framer-motion";
```

## Required Accessibility Guard

Every animated logo component must respect `prefers-reduced-motion`:

```jsx
const reduced = useReducedMotion();
if (reduced) return <StaticLogo size={size} />;
```

`StaticLogo` renders the same SVG paths without any `motion.*` wrappers.

## SVG Filter IDs Must Be Unique

If the component is used more than once on the same page, filter `id`s will collide.
Use a `useId()` hook or a stable unique prefix to namespace them:

```jsx
import { useId } from "react";

export function AtlasLogoLoader({ ... }) {
  const uid = useId();
  const glowId  = `atlas-glow-${uid}`;
  const shadowId = `atlas-shadow-${uid}`;
  // ...
  filter="url(#atlas-glow-...)"
```

## Animation Constraints

- Easing for snap/assembly: cubic-bezier `[0.16, 1, 0.3, 1]` (physical spring feel)
- Loop duration: 3.0–3.6 seconds
- Stagger between faces: ~0.12–0.18s in the `times` array
- `overflow: "visible"` on the `<svg>` element — paths animate outside the viewBox during entry
- Set `originX` / `originY` to the **bounding box center** of each path, not `50% 50%`

## Component Props Contract

```jsx
AtlasLogoLoader({
  size = 140,          // number — svg width/height in px
  className = "",      // string — applied to root div
  message = "Cargando...", // string — Spanish, shown below logo
  showLabel = true,    // boolean
})
```

All user-visible text must be in **Spanish**.

## File Location

Animated logo components live in:
```
apps/desktop/src/components/AtlasLogoLoader.jsx
```

Do not create duplicates (e.g., `LogoLoader.jsx`, `BrandLoader.jsx`). Update the existing file.
