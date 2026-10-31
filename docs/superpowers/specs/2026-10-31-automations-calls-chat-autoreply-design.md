# Automatizaciones: minutas de llamadas, respuestas automáticas y vigencia

Date: 2026-10-31
Status: approved (autonomous roadmap decision; the user asked for the call-minutes
flow, external-chat auto replies and a vacation responder built as automations)
Builds on: 2026-10-31-automations-retries-loops-date-triggers-design.md

## Use cases

1. After a recorded video call: transcribe it, wait for the transcript, write a
   minuta and email it (text + PDF) to the participants, internal and external.
2. An external (website) chat writes: answer automatically (always, the first time,
   out of business hours, or on keywords).
3. "I am on vacation from the 1st to the 15th": anyone who writes me directly gets an
   automatic answer, once a day per conversation.

## Design

### A. Calls (runly.calls)

- **Events** `calls.recording.ready` (recording finished and stored) and
  `calls.transcript.ready` (transcript READY, published by the existing finalize sweep).
  Payload: ids (`id`, `callId`, `conversationId`), `title`, `startedAt`, `durationMs`,
  `participants` (count), `language` (transcript). Link: the chat conversation.
- **Services** (all `system: true`):
  - `runly.calls:transcripts.request({ callId })` — asks for the transcript of the
    call's latest recording (same path as the "Transcribir" button; requested on behalf
    of whoever started the call). Idempotent: an existing transcript is returned.
  - `runly.calls:participants.search({ callId, scope: all|internal|external })` — who
    attended: internal members (joined) and admitted external guests. Items
    `{ id, name, email, internal, userId }`; a loop sends one email per participant.
    Guests without email are returned with `email: null` (filter them with a condition).
  - `runly.calls:minutes.generate({ transcriptId, mode: auto|ai|plain })` — writes the
    minuta, saves it as a PDF in Archivos (company-shared) and returns
    `{ id (file), name, text, mode }`; `text` (max 4500 chars) fits an email body.
    `ai` uses MirAI (Groq or local model; reuses a ready MINUTA). `plain` needs no AI:
    header (date, duration, participants), "posibles acuerdos y pendientes" found by
    keywords, and the transcript by speaker. `auto` = `ai` when configured, else `plain`.
- Transcription itself does not depend on MirAI (local faster-whisper worker).

### B. Chats (runly.chat)

- **Events**
  - `chat.external.message.received` — a visitor wrote in an external (website) chat:
    `conversationId`, `messageId`, `guestName`, `guestEmail`, `text` (max 500),
    `first` (first visitor message), `assignedUserId`, `localHour`, `localWeekday`.
  - `chat.direct.message.received` — a person wrote to another in a direct conversation:
    `conversationId`, `messageId`, `senderId`, `senderName`, `recipientId`, `localHour`,
    `localWeekday`. No message text (private conversations; automation admins read run
    logs). Published only when some automation of the company listens to it.
- **Service** `runly.chat:conversations.reply({ conversationId, text, label })` — posts in
  a direct, group or external conversation of the company as a labelled automatic
  message ("Respuesta automática" or `label`, e.g. "Raúl (respuesta automática)"); in
  an external chat the visitor sees it at once. Automatic messages never publish chat
  events (no reply loops). Channels keep using `messages.post`.

### C. Automation options (company automations)

- `active: { from?, until? }` (YYYY-MM-DD, instance time zone): outside the window the
  automation does not run (events, webhooks, schedules, dates). "Programar" a vacation
  answer = window + enabled.
- `once: { field, hours }`: run at most once per value of a trigger field every N hours
  (1-720), e.g. once per `conversationId` every 24 h. Checked against the run log.
- Conditions on person fields (type `person` in the catalogs: `recipientId`,
  `assigneeId`, `senderId`...) pick the person instead of typing an id.

### D. Starters

New starters in "Nueva automatización": "Minuta de videollamada a participantes",
"Respuesta automática en chats externos (fuera de horario)", "Respuesta automática de
vacaciones".

## Out of scope

Email/WhatsApp inbound channels, AI-written replies to chats, sending a minuta to people
invited who never joined.

## Verification

Unit tests (minuta plain render, participants, once/active window, chat events gating);
live in-process E2E on the test company; web build.
