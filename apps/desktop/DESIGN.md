---
name: runly.pos
description: The register identity of Runly ERP's point of sale; squared, gridded, Runly logo navy and orange, light and dark.
colors:
  logo-orange: "#F5411E"
  logo-orange-hover: "#DC3613"
  logo-orange-text: "#B8330F"
  logo-orange-bright: "#FF8A4C"
  orange-ink: "#0B1530"
  register-navy: "#0B2458"
  band-white: "#FFFFFF"
  band-muted: "#AEBBD6"
  cool-ground: "hsl(216 25% 96%)"
  panel-white: "hsl(0 0% 100%)"
  navy-ink: "hsl(222 72% 14%)"
  slate-muted: "hsl(222 22% 38%)"
  muted-fill: "hsl(218 24% 93%)"
  hairline: "hsl(219 20% 87%)"
  input-rule: "hsl(219 16% 74%)"
  hover-surface: "hsl(216 25% 97%)"
  press-surface: "hsl(218 24% 94%)"
  dark-orange: "#FF5A2E"
  dark-orange-hover: "#FF7A3D"
  dark-orange-ink: "#0B0F17"
  dark-band: "#05070C"
  dark-band-white: "#F4F7FF"
  dark-band-muted: "#8E9AB3"
  dark-ground: "hsl(222 35% 6%)"
  dark-panel: "hsl(222 33% 10%)"
  dark-ink: "hsl(220 33% 94%)"
  dark-muted-text: "hsl(220 20% 68%)"
  dark-muted-fill: "hsl(222 30% 15%)"
  dark-hairline: "hsl(222 28% 19%)"
  dark-input-rule: "hsl(222 22% 30%)"
typography:
  display:
    fontFamily: "Plus Jakarta Sans, system-ui, -apple-system, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 700
    lineHeight: 1.1
    fontFeature: "tnum"
  headline:
    fontFamily: "Plus Jakarta Sans, system-ui, -apple-system, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 700
    lineHeight: 1.33
  title:
    fontFamily: "Plus Jakarta Sans, system-ui, -apple-system, sans-serif"
    fontSize: "1rem"
    fontWeight: 700
    lineHeight: 1.5
  price:
    fontFamily: "Plus Jakarta Sans, system-ui, -apple-system, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 700
    lineHeight: 1.55
    fontFeature: "tnum"
  body:
    fontFamily: "Plus Jakarta Sans, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
    fontFeature: "tnum"
  label:
    fontFamily: "Plus Jakarta Sans, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.43
  band-caption:
    fontFamily: "Plus Jakarta Sans, system-ui, -apple-system, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 700
    letterSpacing: "0.025em"
rounded:
  sm: "3px"
  md: "4px"
  lg: "6px"
  xl: "6px"
  2xl: "8px"
  3xl: "10px"
spacing:
  hairline: "1px"
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  touch: "44px"
  action: "56px"
  sale-panel: "380px"
  sale-panel-wide: "420px"
components:
  button-charge:
    backgroundColor: "{colors.logo-orange}"
    textColor: "{colors.orange-ink}"
    typography: "{typography.title}"
    rounded: "{rounded.md}"
    height: "{spacing.action}"
  button-charge-hover:
    backgroundColor: "{colors.logo-orange-hover}"
  button-charge-disabled:
    backgroundColor: "{colors.muted-fill}"
    textColor: "{colors.slate-muted}"
  button-outline:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.md}"
    height: "{spacing.action}"
  total-band:
    backgroundColor: "{colors.register-navy}"
    textColor: "{colors.band-white}"
    typography: "{typography.display}"
    padding: "12px 16px"
  total-band-dark:
    backgroundColor: "{colors.dark-band}"
    textColor: "{colors.dark-band-white}"
  search-scan-field:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.navy-ink}"
    rounded: "{rounded.md}"
    height: "{spacing.action}"
  category-chip:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.slate-muted}"
    typography: "{typography.label}"
    rounded: "{rounded.md}"
    height: "{spacing.touch}"
    padding: "0 16px"
  category-chip-active:
    textColor: "{colors.navy-ink}"
  pos-nav-tab:
    textColor: "{colors.slate-muted}"
    typography: "{typography.label}"
    height: "{spacing.touch}"
    padding: "0 12px"
  pos-nav-tab-active:
    textColor: "{colors.navy-ink}"
  product-cell:
    backgroundColor: "{colors.panel-white}"
    textColor: "{colors.navy-ink}"
    padding: "12px"
  payment-method-active:
    backgroundColor: "{colors.logo-orange}"
    textColor: "{colors.orange-ink}"
    rounded: "{rounded.lg}"
    height: "{spacing.action}"
  quantity-badge:
    backgroundColor: "{colors.register-navy}"
    textColor: "{colors.band-white}"
    rounded: "{rounded.sm}"
    height: "28px"
---

# Design System: runly.pos

## Overview

**Creative North Star: "The Counter Instrument"**

This system covers only the POS operating screens: Caja, Comandero, Cocina and the register opened by link (`/app/p/pos/<link>`). It is applied by `PosThemeScope` (`ModuleOutlet` wraps only those paths; `PosDeviceScreen` wraps the link register), which puts `.pos-theme` on the screen and on `body` while mounted, so portaled dialogs, menus and toasts match. The POS administration screens (Órdenes, Citas, Mesas, Administración, historial) keep the regular Runly ERP system and the module color #008C8C. The orange is the default accent; a company can pick its own in Administración > General (`pos_settings.accent_color`), which `PosThemeScope` maps to `--pos-accent-*`.

The POS reads as a business register, not a consumer app: a squared, gridded surface where 1px rules separate the panels, the product grid shares its cell borders, and the charge path is the strongest object on screen. Light theme is a cool grey-white ground with white panels, dark navy ink and a navy band; dark theme is blue-black with graphite panels and grey-white ink. Runly logo orange is reserved for action and selection. The signature is the customer-display band: the total (and the change) sits on a navy band (black in dark) in large tabular figures under a short orange caption, the way a register's customer display reads.

The owner pinned this direction on 2026-11-04 (enterprise and square, not pastel; Runly logo colours; light = orange with dark navy, dark = white/grey with orange; operating screens full screen with their own bar). PRODUCT.md's earlier brand note asks for "friendly and soft rather than harsh"; the build follows the later pin, and the softness lives in plain copy and generous touch sizes, not in rounded pastel shapes. The concept roll was skipped because the owner pinned the direction.

**Key Characteristics:**
- Scoped identity: `.pos-theme` only, light and dark (follows the app's `.dark` class).
- Squared corners (3-10px), 1px hairline rules, ruled product grid.
- Orange only for action and selection, always with dark ink on it.
- Customer-display band for the figure the cashier reads out.
- Tabular numerals everywhere in the scope.
- Opaque surfaces: no glass, blur or brand glow.
- Touch sizes: 44px controls, 56px primary actions.

## Colors

Two inks of the Runly logo, navy and orange, on cool neutral grounds; orange is the only colour that means "do this" or "this is selected".

### Primary
- **Logo Orange** (light `logo-orange`, dark `dark-orange`): fills the charge button, the add (+) square on each product, the quick sale tile, the active payment method, the active Mostrador/Mesas segment, the active category underline and nav underline, the selected product outline, focus rings (`--ring`), `accent-color` and text selection (28% alpha). Hover deepens to `logo-orange-hover` in light and brightens to `dark-orange-hover` in dark.
- **Orange Ink** (`orange-ink`, dark `dark-orange-ink`): the only text colour allowed on an orange fill. White on this orange is 3.6:1 and fails AA; this navy-black is 6.1:1.
- **Orange Text** (`logo-orange-text`, dark uses `logo-orange-bright`): orange used as text on light surfaces, darkened to hold contrast.

### Secondary
- **Register Navy** (`register-navy`; dark `dark-band`, near-black): the customer-display band behind the total, the change and the "Cambio a entregar" panel; the quantity badge on a product in the sale; the outlet tile in the POS bar.
- **Band Caption Orange** (`logo-orange-bright`, both themes): the caption on the band ("Total", "Por cobrar", "Cambio") and the store icon on the navy tile.
- **Band White / Band Muted** (`band-white`, `band-muted`; dark `dark-band-white`, `dark-band-muted`): the figure and the subtotal/tax breakdown on the band.

### Neutral
- **Cool Ground** (`cool-ground`; dark `dark-ground`): the screen background behind the panels.
- **Panel White** (`panel-white`; dark `dark-panel`): bars, the sale panel, product cells, dialogs, chips.
- **Navy Ink** (`navy-ink`; dark `dark-ink`): all primary text.
- **Slate Muted** (`slate-muted`; dark `dark-muted-text`): secondary text, inactive tabs and chips, unit prices.
- **Muted Fill** (`muted-fill`; dark `dark-muted-fill`): product initials tiles, unavailable product cells, disabled orange controls, the selected row of the ERP side menu while in the POS.
- **Hairline** (`hairline`; dark `dark-hairline`): every 1px rule: bar bottoms, panel edges, grid cells, list dividers, dialog borders.
- **Input Rule** (`input-rule`; dark `dark-input-rule`): the 2px search field border, the active chip border, scrollbar thumb.
- **Hover / Press Surface** (`hover-surface`, `press-surface`): product cell hover and active states.

State colours (success, danger, low stock) come from the shared `@runly/ui` tones (emerald, red, amber), not from POS tokens.

### Named Rules
**The Dark Ink On Orange Rule.** Text and icons on any orange fill use the orange ink token, never white.

**The Orange Means Act Rule.** Orange appears only on things you press or things that are selected. Decorative orange, orange headings and orange panels are out.

**The Muted Disabled Rule.** A disabled orange control turns to the muted fill with muted text at full opacity, never a washed-out orange.

## Typography

**Body Font:** Plus Jakarta Sans (with system-ui, -apple-system, sans-serif), inherited from the ERP.

**Character:** One family, weight carries hierarchy; bold for money and titles, semibold for controls, regular for supporting text. The scope sets `font-variant-numeric: tabular-nums`, so every figure column aligns.

### Hierarchy
- **Display** (700, 2.25rem, tabular): the total on the band. The change uses 1.875rem in the charge dialog and 3rem on the sale-complete panel.
- **Headline** (700, 1.5rem): the sale-complete confirmation ("Venta cobrada").
- **Title** (700, 1rem): panel titles ("Venta actual"), screen titles in the restaurant bar; the charge button runs at 1.125rem bold.
- **Price** (700, 1.125rem, tabular): the price on each product cell; line totals use bold body size.
- **Body** (400, 0.875rem): supporting text, counts, breakdowns; 0.75rem for unit prices and the cashier line.
- **Label** (600, 0.875rem): nav tabs, category chips, product names, status text.
- **Band Caption** (700, 0.875rem, 0.025em, uppercase): only the caption on the customer-display band.

### Named Rules
**The Figures Align Rule.** Every money figure is tabular and bold where it is the thing being read.

**The Caption Belongs To The Band Rule.** Uppercase tracked text exists only as the band's caption, directly beside its figure. It is not a section label or eyebrow anywhere else.

## Layout

Full-screen operating screens: the ERP top bar and side menu are hidden, and the POS bar (56px minimum, white panel, 1px rule below) carries outlet and register, cashier, register state, the POS navigation (Caja, Citas, Comandero, Cocina, Órdenes, Administración, plus "Salir del POS"), the Mostrador/Mesas switch, connection state and the "Más" menu.

Caja splits into a product side and a fixed sale panel: search (56px), category chips (44px), then the ruled product grid (2 columns, 3 from 640px, 4 from 1280px, 5 from 1536px). The sale panel sits on the right at 380px (420px from 1280px), with a 1px left rule; lines scroll, the band and the Cobrar row stay pinned at the bottom. On phones the nav wraps to its own row under the bar's top line and scrolls horizontally with a right fade; the sale moves to a compact sheet with the total on the band.

Spacing follows Tailwind's 4px base: 12px and 16px for panel padding, 8px between controls. Touch targets are 44px minimum; primary actions (Cobrar, Confirmar pago, Nueva venta, Vaciar) are 56px.

## Elevation & Depth

Flat by default. Depth comes from the cool ground against white panels and 1px hairlines, not from shadows. Dialogs and sheets are opaque cards with a hairline border and one soft drop shadow; the shared glass variables (`--glass-blur`, `--glass-bg*`, tint, glow) are neutralised inside the scope.

### Shadow Vocabulary
- **Dialog lift** (`box-shadow: 0 18px 48px -16px rgba(11, 21, 48, 0.35)`): dialogs, sheets and floating panels only.
- **Selection outline** (`box-shadow: inset 0 0 0 2px var(--brand-primary)`): a product cell already in the sale.
- **Underline** (`box-shadow: inset 0 -3px 0 var(--brand-primary)`): the active category chip.

### Named Rules
**The Opaque Surface Rule.** No blur, glass, tint or brand glow on any POS surface; a dialog is a card.

## Shapes

Squared. The scope redefines Tailwind's radius scale so shared components inherit it: 3px (sm) for badges and status pills, 4px (md) for buttons, inputs, chips and tiles, 6px (lg/xl) for method buttons and boxed groups, 8-10px (2xl/3xl) as the ceiling. Status pills render as squared outlines in the state colour with no fill; the dialog header icon tile is squared. The product grid is a single ruled sheet: cells share their right and bottom borders against the grid's left and top border, so a short last row stays clean.

## Components

### Buttons
- **Shape:** squared (4px).
- **Charge (primary):** logo orange fill with orange ink, 56px tall, bold 1.125rem, the amount in the label ("Cobrar $87.00", "Confirmar pago $87.00"). Full width or flex-1 next to a secondary.
- **Hover / Focus:** orange deepens (light) or brightens (dark); focus is a 2px orange ring.
- **Disabled:** muted fill, muted text, full opacity.
- **Outline:** white panel, hairline border, navy ink; for Vaciar, Cancelar, Más, quick tender amounts (48px).
- **Ghost icon:** 40-44px squares for discount, remove, clear search, exact scan.

### Chips
- **Category chips:** 44px, 4px corners, white with hairline border and muted text; active gets the input-rule border, navy ink and a 3px orange underline.
- **Status pills:** shared `StatusPill`, squared outline in the state tone, no fill.

### Cards / Containers
- **Product cell:** a cell of the ruled grid, 12px padding, white; hover to the hover surface, press to the press surface; unavailable cells take the muted fill and a status pill. Image (4:3, 4px) or a 40px initials tile; name in label weight; price bottom-left; a 36px orange add square bottom-right. In the sale: a 2px inset orange outline and a navy quantity badge top-right.
- **Sale panel:** white, 1px left rule; header with title, item count and a squared order number tag; lines divided by hairlines with a 48px thumb, stepper and ghost actions.

### Inputs / Fields
- **Search and scan field:** 56px, 4px corners, 2px input-rule border on white, search icon left, clear and exact-scan buttons right. Focus: border turns orange plus the orange ring. A keyboard-wedge scanner works without focus.
- **Shared fields** (`CurrencyField`, `TextField`) inherit the scope's radii and ring; money inputs in the charge dialog run 56px bold 1.25rem.

### Navigation
- **POS nav:** text tabs 44px tall, semibold 0.875rem, muted at rest, navy ink on hover; active tab gets navy ink and a 2px orange bottom border sitting on the bar's rule. "Salir del POS" sits at the end with an exit icon. Permission-gated; restaurant entries only when an outlet serves tables.
- **ERP side menu (when visible in the POS):** selected row is the muted fill with no side stripe.

### Customer-Display Band (signature)
Navy band (black in dark) at the bottom of the sale panel: muted breakdown rows (Subtotal, Descuentos, Impuestos, Ya cobrado), then an orange uppercase caption and the total in 2.25rem bold tabular white, live-announced. The same band, 4px-cornered, shows the change in the charge dialog and "Cambio a entregar" on the sale-complete panel. It is the only dark block in the light theme.

### Payment Method Selector
A radio group of 56px squared buttons with icon and name; the active method is filled orange with orange ink, the rest are white with a hairline border.

## Do's and Don'ts

### Do:
- **Do** wrap only the operating screens in `PosThemeScope` (with the company accent) so dialogs and toasts inherit the scope through `body.pos-theme`.
- **Do** put dark orange ink on every orange fill (6.1:1), never white (3.6:1).
- **Do** reserve orange for actions and selection; show the figure the cashier reads out on the navy band with an orange caption.
- **Do** separate regions with 1px hairlines and keep corners within 3-10px.
- **Do** keep controls at 44px and primary actions at 56px.
- **Do** keep the success, danger and warning tones from the shared `@runly/ui` components.

### Don't:
- **Don't** apply these tokens to the POS administration screens or anywhere else in Runly ERP; they keep the ERP system.
- **Don't** use glass, blur, tint or glow on POS surfaces.
- **Don't** use pastel fills for chips, pills or mode tiles; state is an outline or a solid action fill.
- **Don't** fade a disabled orange control; switch it to the muted fill.
- **Don't** use uppercase tracked labels as eyebrows or section labels; the band caption is the only one.
- **Don't** mark the selected side-menu row with a coloured side stripe.

## Known Open Items

Recorded as defects or gaps of the current build, not as rules to inherit.

- **Success toast left bar.** The success toast still shows the shared component's coloured left bar. The shared toaster's layered `!important` utilities outrank the scoped override, so `pos-theme.css` only repositions toasts (bottom-left, clear of the bar, the scan field and the total). Do not copy the bar into new POS surfaces.
- **No concept roll.** The owner pinned the direction, so no alternative concepts were explored before the build.
- **Floor planner drift.** The floor planner still carries pre-identity round shapes (a glass status pill and round selection marks). They predate this system and are not part of it.
