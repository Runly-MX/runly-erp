# Plan: minutas de llamadas, respuestas automáticas y vigencia

Spec: docs/superpowers/specs/2026-10-31-automations-calls-chat-autoreply-design.md
Each stage: tests + lint + (UI) web build, then its own commit.

1. **Calls** — event catalog (`calls.recording.ready`, `calls.transcript.ready`, person
   types), publish from `onRecordingReady` / `onTranscriptReady`; contracts + handlers
   for `transcripts.request`, `participants.search`, `minutes.generate`
   (`apps/api/src/routes/calls/call-minutes-service.js`: plain/AI content, text, PDF);
   document service gets an awaitable `generateNow`.
2. **Automation options** — compiler validates/normalizes `active` and `once`;
   `system-automations-service` gates runs; UI section «Cuándo está activa» and
   «No repetir» in the trigger inspector; person picker in conditions.
3. **Chats** — events from guest messages and direct messages (gated by listeners);
   `conversations.reply` handler (guest broadcast); MirAI catalog picks them up.
4. **Starters + docs** — three starters; developer docs, module help; sync runly-web and
   the developer hub; live E2E.
