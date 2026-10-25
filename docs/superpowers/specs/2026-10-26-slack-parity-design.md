# Slack parity gaps: integrations, digests, delivery checks and search (Work Platform, phase 6)

Status: draft for approval. Roadmap source: `C:\Users\raulb\.claude\plans\pasted-content-id-468d-creo-que-luminous-waterfall.md`, item 6.

## Problem (verified in the code, 2026-10-26)

Chat itself is solid (channels, DMs, threads with a `ThreadPanel`, presence via `useChatPresence`, mentions, reactions, pins, files, in-chat message search). What keeps Runly from replacing Slack for a team is around it:

- **Nothing can speak into a channel.** Incoming webhooks exist only for automations (`automation-webhook-public.js`); there is no chat service contract, so an automation, a Builder module or an external tool cannot post a message. `chat_messages.sender_type` already allows `'system'` and `metadata` is JSONB, so the storage is ready.
- **Outgoing webhooks exist** through the generic HTTP action of Automation Studio v2 (SSRF guards included); nothing to build, only to document as the answer.
- **Notifications have no digest.** `Notification`, `NotificationDelivery` (in-app, email, push, FCM) and `NotificationPreference` (per event: in-app/email/push/mute) exist; a person who mutes email gets nothing between "every event" and "never".
- **Email and push delivery are unverified.** There is no way for a person or an admin to confirm that a channel actually reaches them; failures only show in `notification_delivery.last_error`.
- **Global search is partial.** `/search` has providers for inventory, purchases, contacts, HR, users, ledger, projects, tasks, calendar, files, notes, canvas, help and chat conversation names. Missing: chat message bodies, LMS, fleet, POS, automations, and every Builder (RME3) module (the registry itself says "not searched yet").
- **Shared channels between companies** do not exist (guests and invitations only).

## Goals

1. Any authorized source can post to a channel as a labelled integration: automations (new action), Builder modules and external tools (per-channel incoming webhook).
2. Digest notifications: a daily or weekly email that collects what the person did not see.
3. A "Probar entrega" check per channel for people and a delivery health view for admins.
4. Global search finds chat messages, the missing core modules and Builder modules.
5. Verify (not rebuild) the thread panel and presence, with an E2E.

## Non-goals (separate specs, later)

- Shared channels between companies (last, large: identity, data ownership and moderation across tenants).
- Slack-style apps directory, slash commands, interactive buttons in messages, workflow builder UI beyond Automation Studio.
- Semantic search (phase 7).
- Calls, huddles and Meet changes.

## Design

### 1. Posting to chat as an integration

**Who speaks.** Messages are stored with `sender_type = 'system'`, no user, and `metadata.integration = { id, name, icon }`. The UI renders them like a bot: name plus a small "Integración" badge, the integration icon as avatar, no reply-as-person actions, but threads and reactions work. This keeps the rule "MirAI is never a user": integrations are not `user_profile` rows, so no user list, search or admin screen ever shows them.

**Table `chat_integration`** (Prisma-managed, UUID v7): `id, company_id, conversation_id, name, icon, token_hash, created_by, enabled, last_used_at, created_at`. One integration belongs to one channel. The token is shown once on creation (hash stored), like the automation webhooks.

**Incoming webhook** `POST /app/p/chat-hook/<token>` (public route under the `/app/p` convention, same hardening as `automation-webhook-public.js`: body size cap, per-token rate limit, constant-time token check, optional origin allow-list). Body: `{ text, title?, link?, fields?: [{ label, value }] }`. Text is plain text with the existing safe markdown subset; no HTML. Rate limit 30 messages per minute per integration; a disabled integration or archived channel answers 404 without detail.

**Channel settings > "Integraciones"**: list, create (name, icon from the icon library), copy URL once, rotate token, disable, delete. Only channel owners/admins (existing `chat.channels.manage` rule). Audit log on create/rotate/delete.

**Service contract** `chat.messages.post` in `service-contracts.js` (args: `channelId, text, title?, link?, fields?`) so Builder modules and core modules use it through `moduleContext.services`. Needs the usual admin grant plus a requirement that the acting module has an enabled integration in that channel or the channel is public to the company. Handler in `module-services/chat.js`; idempotency key supported like the other contracts.

**Automation action "Publicar en chat"** in the shared step runner (`automation-runtime.js`): picks a channel (company channels the author can post in) and a message template with the existing `{{variable}}` syntax. It goes through the same service, with the automation name as the integration label (no per-automation `chat_integration` row needed: `metadata.integration = { kind: 'automation', id, name }`).

**Events.** `chat.message.posted` is NOT added (too noisy, loop risk). An integration message never triggers automations.

### 2. Outgoing webhooks

Already covered by the automation HTTP action. Deliverable here is documentation only: a "Webhooks" section in `docs/developers/automatizaciones.md` with the recipe "event -> HTTP action", the SSRF rules and the signature header (if the action does not sign yet, add `X-Runly-Signature: sha256=<hmac>` over the body with a per-automation secret; check at plan time).

### 3. Notification digests

- New per-user preference `digest` in `UserPreference` (key `notifications.digest`, value `{ mode: 'off' | 'daily' | 'weekly', hour: 8, weekday: 1, timezone }`), edited in the existing notification preferences screen.
- When a digest is on, event types whose email is not "immediate" are collected instead of emailed. Rule: for each event type the person already has `emailEnabled = false` and `inAppEnabled = true`, unread notifications older than 1 hour roll into the digest. Event types with email on keep sending immediately.
- Worker job `notification-digest-job` runs every 15 minutes, picks people whose local `hour` just passed and who have not received a digest since the last window, builds one email: unread notifications grouped by module (max 10 per module, "y N más" link), plus "Mi trabajo" counts (tasks due, mentions, approvals) from the same `work-routes` queries. No email when there is nothing new. Records a `NotificationDelivery` row (`channel = 'email_digest'`) per sent digest so there is never a double send; the unique window key makes the job idempotent.
- Template in `email-templates.js`, Spanish, one button "Abrir Mi trabajo".

### 4. Delivery checks

- **Per person**: in notification preferences, a "Probar" button per channel (correo, push del navegador, push del teléfono). It creates a test notification with `eventType = 'system.test'` addressed to the person, forces that channel, and shows the resulting `NotificationDelivery` status and `last_error` in plain Spanish (for example "El servidor de correo rechazó la conexión", "No hay dispositivos registrados para push").
- **Per company admin**: "Entrega de avisos" panel (Administración): last 7 days counts per channel (sent, failed, queued), the 20 most recent failures with their translated error, and the SMTP/Push configuration state (configured yes/no, never the values). A "Enviar correo de prueba" button to the admin's own address.
- API: `POST /notifications/test { channel }`, `GET /notifications/delivery-health` (admin permission). No secrets in responses.

### 5. Search

- **Chat messages provider** `chat_messages` in `workspace-providers.js`: reuses the membership + permission rules of `chat-search-service.js` (only conversations the person belongs to, not deleted), returns the message snippet, conversation title and a target that opens the message in its thread. Word-prefix matching like the in-chat search, capped at 5 per group in the global palette with "ver todo" opening the chat search.
- **Missing core modules**: providers for LMS (courses), fleet (vehicles by plate/name), POS (products/tickets by number) and automations (by name), each gated by its own permission.
- **Builder modules**: provider factory `createCustomModuleProviders` reading each installed module's models. A model is searchable when its definition lists `searchable: true` on fields (string/text only); the Builder gets a "Buscable" checkbox per field and a default of the title/name field. SQL built from the module's own table names with identifiers taken from the stored definition (allow-listed, never from the request) and company scoping. Target is the module's existing detail route. Developer docs updated (`docs/developers`) and the ZIP snapshot regenerated.
- Search must stay fast with the ~84 ms/query remote latency: all providers still run in parallel with the existing per-provider timeout.

### 6. Verify thread panel and presence

E2E (Playwright, two users): reply in a thread opens `ThreadPanel` and both see the reply count update; presence dot shows online/away and clears on leave. Fix whatever it finds; no new features.

## Data and migration

One forward migration: `chat_integration`. Everything else reuses existing tables (`user_preference`, `notification_delivery`, `notification_preference`). No change to `chat_messages` (the `system` sender type is already allowed). No edits to applied migrations.

## Permissions and security

- Creating integrations requires the channel admin rule; the webhook token is a bearer secret: stored hashed, shown once, rotatable, rate limited, never logged.
- Posted text is escaped by the same renderer as normal messages (no HTML, links shown as links without preview fetching on the server, so no SSRF surface).
- `chat.messages.post` obeys the service grant model: instance/company grant by the admin, user permission and active company checked, writes audited.
- Digest and test endpoints act only on the caller's own notifications; health panel needs the admin permission and returns counts and translated errors only.
- Builder search reads only fields marked searchable and only tables of enabled modules in the caller's company; never exposes columns outside the definition.

## Testing (lean)

- Unit: webhook token and rate-limit rules, integration message shaping and escaping, digest window and grouping (pure functions), search field allow-listing for custom modules.
- E2E scripts in `.e2e/`: webhook posts into a channel and the message shows with the badge (rate limit returns 429); automation "Publicar en chat" posts; digest job on a fixed clock builds one email for a seeded unread set and none on a second run; "Probar" shows a delivery result; global search returns a chat message and a Builder-module record; thread/presence two-user check.

## Rollout order

1. Chat integrations (table, public webhook, channel settings, service contract, automation action).
2. Search (chat messages, missing core modules, Builder modules + "Buscable").
3. Delivery checks (person test + admin health).
4. Digests (preference, worker job, template).
5. Thread/presence verification and docs (outgoing webhook recipe, developer docs, MCP/MirAI mention if tools are touched).

## Open decisions (defaults chosen)

- Integrations are per channel and not users (default). Alternative rejected: a bot `user_profile` per company, which breaks "MirAI is never a user" and pollutes user lists.
- Digest only for event types whose email is off, with a 1-hour grace (default); an "everything in the digest" mode can come later.
- Builder search is opt-in per field with the title field on by default.
- Messages from integrations never trigger automations (avoids loops).
