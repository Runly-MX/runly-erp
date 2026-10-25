# Automation visual editor "Flujo" (design)

Status: implemented (autonomous decision, 2026-10-25), stage D1 of Automation Studio v2.
Builds on: stages A-C and `2026-10-25-system-automations-design.md`. The MirAI/MCP tools (D2) are a separate step.

## Goal

An editor that shows an automation as it behaves, works equally with a mouse and a finger, and never needs hover to be usable. It edits the same definition object as the form, so both views are interchangeable (a switch "Flujo | Formulario" on every automation card, remembered per viewer in `localStorage` with a safe fallback).

## Concept: the thread

The automation is one vertical thread from its trigger to its last step. The thread itself carries information:

- A **solid brand line** means "runs right away".
- After a wait or an approval the line turns **dashed and grey**, with the caption "Desde aquí corre en segundo plano": the same rule the compiler enforces (only services that need no person), made visible.
- Waits and approvals are **amber** nodes on the thread; the trigger is the brand-filled node; conditions are a "Solo si" node (or "Siempre"); steps are neutral nodes.

Vertical, not a free canvas: it reads top to bottom, scales to phones and needs no zoom or pan.

## Interaction

| Action | Mouse / keyboard | Touch |
|---|---|---|
| Edit a node | Click; inspector docks on the right (>= 1024 px) | Tap; inspector opens as a side sheet (bottom sheet on phones) |
| Insert a step | `+` on the thread between nodes (faint, solid on hover/focus) or the always-visible "Agregar un paso" row | `+` always visible, 36 px (44 px hit area); same menu |
| Reorder | Drag the grip (revealed on hover/focus), or `Alt` + arrows | Drag the always-visible grip (`touch-action: none` only on the grip, so the page still scrolls) |
| Move / remove | Inspector buttons; `Delete` on a focused node; toast "Deshacer" | Inspector buttons (44 px), same toast |
| Navigate | Arrow keys move focus node to node | Standard |

Invalid operations are refused before they happen, with the reason: the insert menu shows each disabled option with why ("Máximo 5 pasos", "Solo una aprobación"...), and a drag that would leave a wait first/last/adjacent to another pause shows a red drop line and is ignored. Rules live in `lib/flowModel.js` (pure, unit tested) and mirror the compiler's.

## Hover and no-hover

- Secondary affordances (grip, `+`) use `group-hover` / `focus-within` and are forced visible under `@media (hover: none)`.
- Targets grow under `@media (pointer: coarse)`: nodes keep a 48 px minimum row, grips and `+` 36-44 px, inspector buttons 44 px.
- Nothing essential is hover-only: every operation exists in the inspector header and the insert menu; `title`/`aria-label` replace tooltips.
- Keyboard: nodes are real buttons in a list, `aria-current` marks the selection, drag has a keyboard equivalent, focus is visible, motion is limited to opacity/background transitions.

## Visual identity

Uses only Runly tokens: brand primary for the thread and trigger, amber for pauses (the existing warning semantic), flat brand tint (`bg-(--brand-primary)/15`) for the selected node with no ring or glow, controls at `rounded-md`, containers `rounded-lg`. No new colors or fonts.

## Structure

`components/builder/flow/`: `AutomationFlow` (state, operations, layout), `FlowNode` (thread segment, node, `+` slot, closing row), `FlowInspector` (header actions + the existing editors: trigger, conditions, per-step `StepEditor`), `useFlowDrag` (pointer-based reorder). `AutomationCard` hosts the switch; the Builder tab and Runly Core > Automatizaciones both get the new view because they share the card.

## Verification

Unit: `flowModel` (insert/move/remove rules, texts). Browser automation (Playwright) on desktop 1440 px with mouse and on a 390 px touch viewport: drag reorder, `Alt`+arrow reorder, insert from `+`, delete with undo, refused invalid drop, `+` visible and >= 36 px without hover, sheet inspector on phones. Screenshots reviewed on both.
