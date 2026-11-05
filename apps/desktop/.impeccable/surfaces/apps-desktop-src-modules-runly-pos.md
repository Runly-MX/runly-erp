---
version: 1
slug: "apps-desktop-src-modules-runly-pos"
primary_target: "apps/desktop/src/modules/runly.pos"
related_targets: []
---

# runly.pos screens

Mode: Operate. Scope: every screen under `apps/desktop/src/modules/runly.pos/screens` (Caja, Citas, Órdenes, Administración, Comandero, Cocina, planos, estaciones, sesiones) plus the register opened by link.

Task: charge fast and without doubt at a counter (touch, scanner, keyboard); owners configure and close registers. Constraints: @runly/ui components, Tailwind, Spanish copy, files under 1000 lines, behavior from `docs/superpowers/specs/2026-11-04-pos-direct-sale-redesign.md` preserved.

Pinned by the owner (2026-11-04): enterprise and square, not pastel; Runly logo colors; light theme = orange with dark navy, dark theme = white/grey with orange; operating screens full screen with their own bar.

## Direction contract

THESIS: The counter as a business instrument: a squared, gridded register where the charge path is the strongest object on screen. Refuses the rounded pastel consumer-app card grid and the ERP admin page wearing a Cobrar button.

OWN-WORLD: Runly logo palette. Light: cool grey-white ground, white panels on 1px grey rules, dark navy ink and navy bands, logo orange only for action and selection. Dark: blue-black ground, graphite panels, grey-white ink, the same orange. Radii 4-8px, square chips with an orange underline when active, tabular numerals.

STORY: The cashier knows where everything is at once, scans or taps, sees each line at the price the customer pays, reads the total from the display and charges; the owner finds settings grouped and plain.

FIRST VIEWPORT: Caja full screen: POS bar (outlet, register, cashier, status, POS nav Caja/Citas/Órdenes/Administración, Más). Left: search, square category tabs, product grid. Right 380-420px panel: lines, then the total display band with Cobrar.

FORM: Pinned by the owner (Runly logo palette, enterprise grid); signature move: the total shown as a register customer display, a navy (dark: black) band with large tabular figures and an orange caption. seed: none (direction pinned by the user; no roll)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
