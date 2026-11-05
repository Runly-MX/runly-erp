# Product

<!-- impeccable:product-schema 1 -->

Scope: this record was captured for the point of sale module (`runly.pos`) of Runly ERP. The rest of the ERP has not been interviewed yet; do not infer its users or purpose from this file.

## Platform

web

## Users

Cashiers and owners of small businesses in Mexico: abarrotes and corner shops, stores, coffee shops, service businesses that work by appointment, and small restaurants. Cashiers charge standing at a counter on a touch tablet, a counter PC or a phone, often with a barcode scanner. Owners and managers configure the POS in Administración and close registers.

## Product Purpose

Let a small business sell, charge and close its register quickly and without mistakes, with no separate system to set up or keep in sync. Success: a new shop sells in its first minute, a cashier charges a sale in a few taps or scans, and the corte matches the cash in the drawer.

## Positioning

The POS lives inside Runly ERP: catalog, stock per outlet, contacts, calendar and accounting are the same data the rest of the business uses, so nothing is exported or synchronized. On top of that it offers registers opened by link with a cashier PIN, appointments charged from the register, and free-amount quick sales.

## Operating Context

- Modes: Tienda (direct counter sale), Restaurante (tables, comandero, kitchen) and Mixta; the business mode applies to every outlet.
- Daily ritual: open the register with a starting cash amount, sell, cash in/out, close with a blind count (corte).
- Counter devices may run without an ERP login through a paired link and a 4-6 digit cashier PIN.
- Closed registers, reservations and appointments appear in the company calendar.
- Spanish UI; amounts in MXN by default with IVA.

## Capabilities and Constraints

- Frontend: React + Tailwind, shared components from `@runly/ui`; native HTML form elements and browser dialogs are not allowed where a `@runly/ui` equivalent exists.
- No offline sales: charging requires a connection.
- No source file over 1000 lines.
- Specs: `docs/superpowers/specs/2026-11-04-pos-direct-sale-redesign.md` and `2026-11-01-pos-catalog-ux.md` describe implemented behavior that must be preserved.

## Brand Commitments

The owner wants the POS to carry its own identity, independent from the ERP: enterprise and squared, not pastel or childish, in the Runly logo colors (light theme: orange with dark navy; dark theme: grey-white with orange), with both a light and a dark theme (confirmed 2026-11-04). Working name of the sub-brand in explorations: "caja". The ERP edition name comes only from `RUNLY_EDITION_NAME`.

## Evidence on Hand

No real product photos, customer names or sales figures are on hand; demonstration data must be labeled as such.

## Product Principles

1. The counter comes first: the charge path is the shortest, largest and most visible thing on screen.
2. Nothing to synchronize: everything the POS shows is the ERP's own data.
3. Money is never ambiguous: what the cashier sees on a line, the total and the receipt agree.
4. Configuration stays out of the way: sensible defaults, restaurant tools only when needed.

## Accessibility & Inclusion

- One-handed touch use: targets of 44 px or more, primary actions within thumb reach on phones and tablets.
- WCAG AA contrast, full keyboard operation and screen-reader support.
- Fast scanner and keyboard flow without a mouse.
- Light and dark themes.
