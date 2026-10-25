# Interactive chat messages (buttons)

Status: built with the spec. Scope chosen by default: approvals of automations plus link buttons from integrations; custom action buttons and purchases approvals are later.

## Problem
Approvals live in a Home widget and the bell. A request that already happens in a team channel cannot be answered where people are talking, and integrations can only post plain text.

## Design
- A message can carry `metadata.actions`: link buttons (`{ kind: "link", label, url }`, up to 3, `https`/`http` or a Runly path) or the pair **Aprobar / Rechazar** of an automation approval (`{ kind: "approval", approvalId, decision }`).
- Buttons come only from the server. Webhooks and the `runly.chat:messages.post` service may add link buttons; only the service (and the approval step) can add decision buttons, because they need a real approval id. A webhook that sends `approvalId` gets none.
- `POST /chat/messages/:id/actions/:actionId`: the person must be in the conversation; the stored action decides what happens (the client sends only ids). The approval service checks the person is one of the approvers and that it is still pending, so the card has the same rules as the Home widget. The first decision closes the card for everyone: `metadata.resolution` ("Aprobado por Ana"), and members refetch through `chat.message.reaction`.
- The approval step of Builder and company automations has an optional **channel** ("Publicar también en un canal"): the request is also posted there as a card ("Aprobaciones" integration label). The bell notification and the Home widget keep working; if the channel does not exist the step still works and the failure is logged.
- Interface: buttons under the message text (primary / danger / link), 44 px on touch; link buttons are anchors, so they work with the keyboard and open in a new tab.

## Own buttons and live cards (added 2026-10-26)
- An integration can set a **reply address** (`chat_integrations.callback_url`, https, no credentials or port). Its webhook may then post buttons `{ label, value, style }`; without a reply address they are dropped. Pressing one sends a signed POST (`event: "button"`, message, button, value, person) through the guarded automation HTTP service (allowed destinations only, same HMAC secret and SSRF rules), closes the card ("Ana: Resolver") and fails with the destination's reason if it cannot be reached (the card stays open).
- Cards posted by the worker or by automation runs use a realtime broadcaster built from the environment, so they appear live.
- Source labels: system sources get readable names ("Automatizaciones").

## Purchase approvals (added 2026-10-26)
- Compras > Configuración > **Aprobaciones en el chat**: the company picks a channel (stored in `company_module.config.approvalChannel` of `runly.purchases`; the channel must exist). A worker pass (every minute) posts each pending approval of the last 7 days as a card (document, case, estimated total, reason) with Aprobar / Rechazar, once.
- Pressing a button runs `procurement.decideApproval` with the person's own permission (`purchases.approval.decide`) and the company's `approvals` capability, so the rules are those of the purchases screen. A card whose approval was decided elsewhere closes without deciding again; the same pass closes cards decided in Compras.

## Not built
Buttons that run slash commands.

## Testing
Unit: button rules, action service (decide once, resolved/unknown/link/unreadable are refused, approval errors keep their status). E2E `.e2e/chat-buttons-e2e.mjs` (8 checks): non-approver 404, webhook link buttons and unsafe links dropped, webhook cannot forge decision buttons, press Aprobar in the interface, second decision 409.
