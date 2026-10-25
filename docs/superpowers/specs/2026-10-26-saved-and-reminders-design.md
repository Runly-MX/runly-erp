# Saved messages and reminders (chat)

Status: built together with the spec (small scope, approved with "ok sigue"). Slack gap 2 of the chat roadmap.

## Problem
People cannot keep a message for later or ask Runly to remind them of it; important requests get lost in channels.

## Design
- **Table `chat_saved_messages`** (migration `20261203000000`, raw SQL like other chat tables): one row per person and message, with optional `remind_at`, `reminded_at`, `completed_at`.
- **API**: `GET /chat/saved`, `POST|PATCH|DELETE /chat/messages/:id/save`. The message must be in a conversation the person belongs to, in the active company, with access (`runly_chat_user_access`). Reminder in the future and at most one year ahead; at most 500 saved.
- **Reminders**: a worker tick every minute claims due rows (`reminded_at` set first, `FOR UPDATE SKIP LOCKED`) and publishes a `chat.reminder` notification (priority high, link to the message). Email/push follow the person's preferences and Do Not Disturb; push is on by default for this event.
- **Interface**: message menu gets "Guardar para después" (toggle) and "Recordarme..." (a popover with 20 min, 1 h, 3 h, tomorrow 9:00, Monday 9:00, one week; a bottom sheet on touch). Sidebar entry "Guardados" opens a sheet: reminders first, open the message, mark done, remove.
- Popover for the quick time list (light choice), sheet for the list view; no modal.

## Not built
Custom date/time for a reminder, reminders from the composer (`/remind`, comes with slash commands), snooze.

## Testing
Unit: reminder date rules, due reminder publishes once with link, unreadable message is 404; `reminderOptions` tests. E2E `.e2e/chat-saved-e2e.mjs` (13 checks).
