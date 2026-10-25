# Slack parity gaps: implementation plan

Spec: `docs/superpowers/specs/2026-10-26-slack-parity-design.md` (approved 2026-10-26, defaults accepted).

## Order and tasks

1. Chat integrations
   - Migration `chat_integrations` (raw SQL, chat tables are not Prisma models).
   - `chat-integrations-service.js` (token hash, message shaping, rate limit, CRUD, post), management routes under `/chat/channels/:id/integrations`, public `POST /public/chat-hooks/:token`.
   - Unread counts include integration messages.
   - Service contract `runly.chat:messages.post` + handler (also used by the automation action; channel by name or id).
   - UI: integration badge on messages, channel settings "Integraciones", SDK.
   - Tests: unit + `.e2e/chat-integrations-e2e.mjs`.
2. Search: chat messages provider, LMS/fleet/POS/automations providers, Builder modules with "Buscable".
3. Delivery checks: `POST /notifications/test`, `GET /notifications/delivery-health`, UI in preferences and admin.
4. Digests: preference, worker job with idempotent window, email template.
5. Thread/presence E2E, docs (outgoing webhook recipe, developer docs + ZIP snapshot), TASKS.

Each step: lint, unit tests, E2E, docs, commit (never any AI trailer).
