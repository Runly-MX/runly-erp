---
name: svg-logo-animator
description: "Convert a PNG/SVG logo into a pixel-perfect animated React component. Use when building logo loaders, splash screens, brand animations, or any component that must be faithful to a real logo. Triggers: animate logo, logo loader, brand animation, convert logo to SVG, recreate logo as component, isotype animation, loading screen with logo."
argument-hint: "Path to the logo file (PNG or SVG) + desired animation style — e.g. 'apps/desktop/public/runly/runly-isotipo-light.png, assembly animation'"
---

# SVG Logo Animator — Runly ERP

This skill converts a brand logo into a **pixel-perfect animated React component** using SVG paths traced from the original asset.

## Phase 1 — Obtain a Traced SVG

You cannot reliably approximate logo geometry from a PNG using clip-paths or eye-estimation. You need real SVG paths. Follow one of these paths:

### Option A — Check for an existing SVG source (always try first)

Search the repo:
```bash
find apps/desktop/public/runly -name "*.svg" | head -20
```

If an SVG exists, skip directly to Phase 2.

### Option B — Vectorize the PNG (if no SVG exists)

**Recommended tool: Vectorizer.io (online, free, high quality)**

1. Open https://vectorizer.io in a browser
2. Upload the PNG from `apps/desktop/public/runly/` (use the `_isotype_only.png` variant for the symbol)
3. Settings: Mode = "Logo", Colors = exact count (count manually from the PNG), Output = SVG
4. Download the SVG
5. Save it alongside the PNG in `apps/desktop/public/runly/` with the same base name (e.g., `runly-erp_isotype_only.svg`)
6. Also copy it to `apps/desktop/public/runly/` for runtime use

**Alternative: Inkscape (local)**
```
File → Import PNG → Path → Trace Bitmap
  Mode: Multiple Scans → Colors
  Scans: match exact color count
  Options: ✓ Stack scans, ✓ Remove background
File → Save As → Plain SVG
```

**Alternative: Potrace (CLI)**
```bash
# Convert to BMP first (potrace requires BMP or PBM)
magick apps/desktop/public/runly/runly-isotipo-light.png apps/desktop/public/runly/runly-erp_isotype_only.bmp
potrace --svg --color "#0A1D44" -o apps/desktop/public/runly/runly-isotipo-light.svg apps/desktop/public/runly/runly-erp_isotype_only.bmp
```

---

## Phase 2 — Analyze the SVG Structure

Open the SVG file and identify the logical "faces" or "pieces" of the logo. Read the file:

```bash
cat apps/desktop/public/runly/runly-isotipo-light.svg
```

Look for:
- `<path>` elements — each one is a face/layer
- `fill` attributes — map colors to brand token names
- `id` or `class` attributes — may already name the faces
- `<g>` groups — indicate logical groupings

### Runly ERP Isotype — Known Structure

The Runly isotype is a **3-face isometric "A" arch**:

| Face | Expected fill | Description |
|---|---|---|
| Top/roof | `#0A1D44` (`--runly-navy`) | Flat chevron/roof shape |
| Left pillar | `#102A5E` (`--runly-navy-2`) | Dark vertical parallelogram |
| Right pillar | `#21C7FF` (`--runly-cyan`) | Bright blue vertical parallelogram |

### Extract individual path data

For each `<path>` in the SVG, note:
1. The exact `d` attribute value (the path string)
2. The `fill` color
3. The bounding box (visual center — for setting transform origin)
4. The natural direction from which it should enter (top face → from above, left face → from left, right face → from right)

To inspect bounding boxes quickly in a browser:
```js
// Paste in DevTools console after opening the SVG in a browser tab
document.querySelectorAll('path').forEach((p, i) => {
  const bb = p.getBBox();
  console.log(`Path ${i}: fill=${p.getAttribute('fill')}, cx=${bb.x + bb.width/2}, cy=${bb.y + bb.height/2}`);
});
```

---

## Phase 3 — Normalize the ViewBox

All paths must share a single consistent `viewBox`. The standard for this project is `0 0 100 100`.

If the SVG uses a different viewBox (e.g., `0 0 512 512`), scale all path coordinates:

```js
// Scale factor example: 512 → 100
// factor = 100 / 512 = 0.195
// Multiply all numeric coordinates in path `d` by factor
```

Or use the SVG `viewBox` as-is and set `width`/`height` on the React SVG element directly — no coordinate transformation needed.

---

## Phase 4 — Build the Animated Component

### Component contract

```jsx
// apps/desktop/src/components/AtlasLogoLoader.jsx
export function AtlasLogoLoader({
  size = 140,        // px, applied to svg width/height
  className = "",    // root div
  message = "Cargando...",  // label text (Spanish)
  showLabel = true,
})
```

### Animation principles

Each face enters from its "natural gravity direction":
- **Top face** → enters from above (`y: -N → 0`)
- **Left face** → enters from bottom-left (`x: -N, y: +N → 0, 0`)
- **Right face** → enters from bottom-right (`x: +N, y: +N → 0, 0`)

Stagger the entries: top → left → right (each ~0.12–0.18s offset in the `times` array).

After assembly:
- Short **breathe** (scale 1 → 1.015 → 1) while fully visible
- **Glow pulse** on the cyan face (`feGaussianBlur` filter + opacity animation)
- Smooth **fade out** before loop reset

### Standard animation skeleton

```jsx
import { motion, useReducedMotion } from "motion/react";

const SPRING = [0.16, 1, 0.3, 1]; // cubic-bezier — physical snap
const DURATION = 3.2;              // seconds per full loop

// Paths sourced from the traced SVG — DO NOT approximate
const TOP_PATH   = "M ...";  // exact d attribute from SVG
const LEFT_PATH  = "M ...";  // exact d attribute from SVG
const RIGHT_PATH = "M ...";  // exact d attribute from SVG

function StaticLogo({ size }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" fill="none">
      <path d={TOP_PATH}   fill="#0A1D44" />
      <path d={LEFT_PATH}  fill="#102A5E" />
      <path d={RIGHT_PATH} fill="#21C7FF" />
    </svg>
  );
}

export function AtlasLogoLoader({ size = 140, className = "", message = "Cargando...", showLabel = true }) {
  const reduced = useReducedMotion();
  if (reduced) return <StaticLogo size={size} />;

  return (
    <div className={`flex flex-col items-center justify-center gap-5 ${className}`}>
      <svg width={size} height={size} viewBox="0 0 100 100" fill="none" style={{ overflow: "visible" }}>
        <defs>
          <filter id="atlas-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
          <filter id="atlas-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="4" stdDeviation="5" floodColor="#000" floodOpacity="0.28" />
          </filter>
        </defs>

        {/* TOP FACE */}
        <motion.path
          d={TOP_PATH}
          fill="#0A1D44"
          filter="url(#atlas-shadow)"
          animate={{
            opacity: [0, 0, 1, 1, 1, 1, 0.95, 0],
            y:       [-28, -28, 0, 0, 0, -1, -2, -4],
            scale:   [0.9, 0.9, 1, 1, 1, 1.02, 1.01, 0.95],
          }}
          transition={{ duration: DURATION, times: [0, 0.06, 0.20, 0.50, 0.70, 0.78, 0.88, 1.0], repeat: Infinity, ease: SPRING }}
          style={{ originX: "<cx of top face>px", originY: "<cy of top face>px" }}
        />

        {/* LEFT FACE */}
        <motion.path
          d={LEFT_PATH}
          fill="#102A5E"
          filter="url(#atlas-shadow)"
          animate={{
            opacity: [0, 0, 0, 1, 1, 1, 0.95, 0],
            x: [-26, -26, -26, 0, 0, 0, -0.5, -2],
            y: [20, 20, 20, 0, 0, 0, -0.5, -2],
            scale: [0.9, 0.9, 0.9, 1, 1, 1.02, 1.01, 0.95],
          }}
          transition={{ duration: DURATION, times: [0, 0.14, 0.24, 0.34, 0.50, 0.70, 0.82, 1.0], repeat: Infinity, ease: SPRING }}
          style={{ originX: "<cx of left face>px", originY: "<cy of left face>px" }}
        />

        {/* RIGHT FACE — with cyan glow */}
        <motion.path
          d={RIGHT_PATH}
          fill="#21C7FF"
          filter="url(#atlas-glow)"
          animate={{
            opacity: [0, 0, 0, 0, 1, 1, 0.95, 0],
            x: [26, 26, 26, 26, 0, 0, 0.5, 2],
            y: [20, 20, 20, 20, 0, 0, -0.5, -2],
            scale: [0.9, 0.9, 0.9, 0.9, 1, 1, 1.02, 0.95],
          }}
          transition={{ duration: DURATION, times: [0, 0.16, 0.28, 0.38, 0.50, 0.70, 0.82, 1.0], repeat: Infinity, ease: SPRING }}
          style={{ originX: "<cx of right face>px", originY: "<cy of right face>px" }}
        />

        {/* GLOW BURST — fires when assembled */}
        <motion.ellipse
          cx="<cx of right face>" cy="<cy of right face>" rx="16" ry="20"
          fill="#21C7FF"
          style={{ filter: "blur(14px)" }}
          animate={{
            opacity: [0, 0, 0, 0, 0, 0.5, 0.18, 0],
            scale:   [0.4, 0.4, 0.4, 0.4, 0.4, 1.3, 1.7, 2.0],
          }}
          transition={{ duration: DURATION, times: [0, 0.16, 0.28, 0.38, 0.52, 0.64, 0.76, 0.90], repeat: Infinity, ease: "easeOut" }}
        />
      </svg>

      {showLabel && (
        <motion.span
          className="text-xs font-medium tracking-[0.22em] uppercase"
          style={{ color: "hsl(var(--muted-foreground))" }}
          animate={{ opacity: [0.3, 0.9, 0.3] }}
          transition={{ duration: 2.2, repeat: Infinity, ease: "easeInOut" }}
        >
          {message}
        </motion.span>
      )}
    </div>
  );
}
```

### Filling in `originX` / `originY` and glow `cx`/`cy`

Use the bounding box center of each path (from the DevTools trick in Phase 2) as `originX`/`originY`. These are the transform pivot points — if they're wrong, the animation will scale/rotate from the wrong anchor.

---

## Phase 5 — Validate Visual Fidelity

After building the component:

1. Open the app (`pnpm dev:frontend`)
2. Compare side-by-side: the static `<StaticLogo>` render vs. the original PNG in `apps/desktop/public/runly/`
3. Check:
   - [ ] All 3 faces present, correct colors
   - [ ] No gaps between faces (adjacent edges must share exact coordinates)
   - [ ] Proportions match — logo doesn't look squished or stretched
   - [ ] Glow appears on the correct (cyan) face only
4. If any face is misaligned, adjust the path coordinates in the SVG source, not in the React component

---

## Phase 6 — Save the SVG to the Repo

Once paths are validated:

```bash
# Save traced SVG in apps/desktop/public/runly/ (source of truth)
# apps/desktop/public/runly/runly-isotipo-light.svg

# Copy to public for runtime use
cp apps/desktop/public/runly/runly-isotipo-light.svg apps/desktop/public/runly/runly-isotipo-light.svg
```

Update `apps/desktop/public/runly/README.md` to list the SVG file under canonical sources.

---

## Quick Reference — Runly Brand Colors

| Token | Hex | Usage |
|---|---|---|
| `--runly-navy` | `#0A1D44` | Top face, backgrounds |
| `--runly-navy-2` | `#102A5E` | Left face, secondary navy |
| `--runly-navy-dark` | `#06152F` | Darkest backgrounds |
| `--runly-blue` | `#0A7BFF` | Interactive blue |
| `--runly-cyan` | `#21C7FF` | Right face, brand primary, glow |

## Motion Library

This repo uses `motion/react` (Motion for React, formerly Framer Motion v11+).
Import: `import { motion, useReducedMotion } from "motion/react";`
Do NOT import from `framer-motion`.
