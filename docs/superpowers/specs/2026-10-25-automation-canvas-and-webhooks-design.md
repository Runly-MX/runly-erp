# Automation workspace: canvas editor, webhooks and connections (design)

Status: implemented (autonomous decision, 2026-10-25). Replaces the vertical-thread editor of `2026-10-25-automation-visual-editor-design.md`, which felt like a form, and answers the feedback on Automatizaciones: padding, everything on one page, no canvas, no way to receive data.

## What changed and why

| Feedback | Decision |
|---|---|
| "Todo está en una vista, muy a manera de formulario" | The screen becomes a **workspace**: a list of automations (cards with a miniature of each flow, status, last run) and a **full-screen editor per automation** (`/automations/:key`) with a top bar (name, active, connections, test, history, save). |
| "Esperaba un canvas tipo n8n" | The editor is a **canvas**: blocks on a pannable, zoomable dotted surface joined by arrows; a block palette you can drag from; drag a block's grip to reorder; "+" on every arrow. The inspector docks on the right (sheet/bottom sheet on small screens). |
| "¿Puedo enviar pero no recibir?" | New trigger **"Cuando otro sistema me envía datos"** (incoming webhook) plus an **allowed origins** list, symmetrical to allowed destinations. |
| "Saber cómo se envía la información" | The webhook inspector shows the secret URL, the fields it expects (detected from a real test message), a ready `curl`, and the response codes. The connections dialog explains both directions. |
| "Mejorar ese modal, agregar una imagen referencial" | "Conexiones externas" dialog with a diagram (other system -> Runly -> other system) and two tabs, Recibir datos / Enviar datos. |
| "Estilos mal, sin padding" | Spacing on an 8 px rhythm, bordered cards with padding, inspector sections, single-column rows in narrow panels, wizard for new automations. |

## Canvas

- **Layout**: left-to-right on wide canvases, top-to-bottom under 640 px. Block 248 x 92 with ports; edges are SVG curves with an arrowhead. Edges leaving a wait or approval are dashed and drift slowly (a still dash under reduced motion): from there the flow runs in the background, the same rule the compiler enforces.
- **View**: opens at 100% when everything fits at >= 70%, otherwise at 85% from the first block (tall flows from the top); "Ajustar" shows everything. Pan: drag the background (one finger/pointer) or wheel; zoom: Ctrl/Cmd + wheel, pinch, or the +/- buttons. Selecting a block pans it into view.
- **Editing**: select a block -> inspector. Reorder by dragging the grip (always visible on touch) or `Alt` + arrows; insert from any arrow's "+", from the always-visible end slot, or by dragging a block from the palette onto a slot (it snaps to the closest one). Invalid drops/insertions are refused with the reason. Delete with the inspector or `Supr`, with undo.
- **Hover and touch**: secondary controls reveal on hover/focus where hover exists and are always visible on touch; targets grow to 44 px under `pointer: coarse`; the canvas only captures gestures on its own surface. Everything is also reachable from the inspector and the keyboard.
- **Identity**: Runly tokens only (brand for the thread and trigger, amber for pauses), flat tinted selection, controls at `rounded-md`, cards at `rounded-lg`.
- **Code**: pure geometry in `lib/canvasLayout.js` (tested), `lib/flowModel.js` (insert/move/remove rules, texts, diagnostics wording), UI in `components/builder/canvas/`.

## Incoming webhooks

```
POST {API}/public/hooks/<secret-token>   Content-Type: application/json   body <= 64 KB
```

- **Trigger** `{ type: 'webhook', fields: [{ key, label?, sample? }], when? }` (company automations only). `fields` announce the data so conditions and blocks can pick them; JSON is flattened (`cliente.nombre` -> `cliente_nombre`, depth <= 3, arrays as short JSON text, <= 100 keys).
- **Security**: the URL token (24 random bytes) is the secret and can be regenerated (the old URL dies at once); optional allow-list of origins (IPs and CIDR networks, `automation_inbound_origins`, empty = anyone with the URL) read from the client IP with the trusted-proxy logic of the MCP server (`RUNLY_TRUSTED_PROXIES`); 60 messages per minute per automation; JSON only; unknown or paused automations answer 404, wrong origin 403.
- **Delivery**: each accepted message is stored (last 20 per automation, for the editor's "last message received" and "use these fields") and queued in the domain event outbox as `automations.webhook.received` (hidden from pickers), so it is delivered at least once with retries; step idempotency uses the event id.
- **Runs** are logged with `triggerKind: 'webhook'`.

## Connections dialog

Recibir: three numbered steps (a real sequence), a `curl` example and the origins list. Enviar: the allowed destinations list and what the other system receives (body sample, `X-Runly-Signature`, `X-Runly-Idempotency-Key`). Everyone can read; `core.modules.manage` edits.

## Data

Migration `20261123000000_automation_webhooks`: `system_automation.webhook_token` (unique, nullable) and table `automation_webhook_event`. Endpoints under `/automations`: `GET|PUT webhook-origins`, `GET :key/webhook/events`, `POST :key/webhook/regenerate`; the list adds `lastRun` per automation.

## Verification

Unit: canvas geometry, flow rules and wording, flatten/origins/rate limit/ingest, webhook event execution. API E2E over the real public URL (202, conditions, flattening, 404/400/415/403, origins validation, regeneration). Browser E2E (Playwright): wizard -> editor -> save -> navigate, drag a grip to reorder, drag a palette block onto the end slot, refusal message for an unfinished block, keyboard delete, zoom. Screenshots reviewed on desktop and a touch phone viewport.
