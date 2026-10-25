# Custom status and Do Not Disturb (chat organization, next step)

Status: draft for approval. Order agreed with the owner: 1) status and DND, 2) saved messages and reminders, 3) slash commands, 4) interactive messages.

## Problem (verified 2026-10-26)

- Presence is only "online or not" (`RealtimeProvider.isUserOnline`). People cannot say "en reunión", "de vacaciones" or "comiendo", and nobody can see why someone does not answer.
- Notifications can be muted per event type with `muteUntil` (`NotificationPreference`), but there is no single "No molestar" switch and no daily quiet hours. The summary email (phase 6) and push keep arriving at any hour.
- Nothing in the interface tells a person who is writing to someone that the other person is unavailable.

## Goals

1. A **status** per person: an emoji + short text, optional expiry ("Hoy", "1 hora", "Esta semana", "Elegir hora"), shown next to their name in chat (rows, message headers, member lists, profile).
2. **No molestar (DND)**: one switch with a duration ("30 min", "1 h", "Hasta mañana", "Hasta..."), plus **quiet hours** by weekday and time. While DND is on, non-urgent notifications are held (in-app stays silent, no push/email/FCM); urgent ones can still come through (see below).
3. A **presence dot** that reflects it: green online, away (idle), red-ish "no molestar", grey offline.
4. Writing to someone in DND shows a quiet notice ("Ana tiene No molestar hasta las 9:00. Recibirá tu mensaje después.") and the message is delivered normally, just without push/email.

## Non-goals

- Calendar-driven automatic status (can reuse this later: events set "en reunión").
- Per-channel DND (the existing per-conversation mute covers it).
- Managers forcing statuses on others.

## Design

### Data (no migration)
`UserPreference` key `chat.status`: `{ emoji, text, expiresAt|null }` and key `notifications.dnd`: `{ until: ISO|null, quiet: { enabled, from: "22:00", to: "07:00", days: [0..6], timezone } }`. Both validated server-side (text 80 chars, emoji one grapheme, times HH:MM, valid IANA zone, `until` at most 30 days ahead). Status expiry is evaluated on read (expired = none); no cleanup job.

### API
- `GET|PUT /profile/status` (own) and `GET /chat/status?userIds=` (batch, same company only, returns `{ userId: { emoji, text, dnd: boolean } }` — never the DND schedule, only whether DND is on now).
- `GET|PUT /notifications/dnd` (own).
- Existing member and conversation payloads gain `status` through the batch endpoint on the client (one request per visible list), keeping server payloads unchanged.

### Delivery rule (server, one place)
In `notification-service.publish`, after the per-event preference check: if the recipient is in DND now (explicit `until` in the future, or inside quiet hours), then
- `in_app` rows are still stored (nothing is lost; the bell shows them when DND ends or when opened),
- `email`, `web_push` and `fcm` deliveries are not created for non-urgent notifications. Urgent = `priority` `critical`, or event types on a small allow-list (`chat.call.incoming` is NOT urgent: it would ring on someone in a meeting; security alerts are).
- The summary email job skips people in DND at send time and sends on the next pass after DND ends (window already idempotent).
Pure function `isInDnd(pref, now)` with tests (overnight ranges, weekdays, time zones, expired `until`).

### Interface
- **Status**: avatar menu (top right) gets "Establecer estado" opening a small popover (emoji picker popover as the channel icon one, text field, duration selector, suggestions: "En reunión", "Comiendo", "De vacaciones", "Trabajando desde casa"). Status shows as the emoji next to the name; hover/tap shows text and expiry.
- **DND**: same menu: "No molestar" with durations and "Horario silencioso..." (settings card in Notificaciones, next to the summary email card). A moon icon on the avatar while active.
- **Presence dot** in chat rows and member lists: green/away/DND/offline (tokens, with text alternative in the title for color-blind users).
- **Notice when writing to someone in DND** under the composer of a direct message only.
- Spanish text, tokens, `rounded-md`, popover (not modal) per owner preference, touch targets 44 px.

## Permissions and security
Own status/DND only; batch lookup returns status for people in the caller's active company and DND as a boolean, never schedules. No MirAI/bot users in lookups.

## Testing (lean)
Unit: DND evaluation, status normalization/expiry, delivery filter (held channels, urgent passes). E2E: set status and see it in the list; enable DND and confirm a published notification stores in-app but creates no email/push delivery; quiet hours overnight; the notice in a DM; expiry hides status.

## Rollout order
1. Data + API + delivery rule + digest skip.
2. Status UI (menu, popover, display in rows/headers/members).
3. DND UI (menu, quiet hours card, dot, DM notice).
4. Docs (help for Chat/Notificaciones), TASKS, MirAI context line.

## Open decisions (defaults chosen)
- DND holds email/push/FCM but keeps in-app rows (default).
- Incoming calls do not break DND (default; a caller sees the notice and can still message).
- Statuses are visible to everyone in the company (default).
