# Chat organization: sections, tidy sidebar and a Slack-like look (Work Platform, phase 6b)

Status: draft for approval. Follows `2026-10-26-slack-parity-design.md` (integrations, search, digests, already built).

## Problem (verified 2026-10-26 in the running app and the code)

- The conversation list is one flat column sorted by last message, with only pin and archive. Everything is mixed: direct messages, groups, channels, the MirAI chat, and the groups that each group call creates (`#Demo reunión ...`). With real use the list becomes a wall of identical rows (purple circle with a letter, bold name, grey preview).
- Group calls create a channel every time, so meeting channels pile up next to the channels people actually use. There is no way to tell them apart, group them or retire them.
- The look is WhatsApp-like (large round avatars, one row style for everything). Slack reads as organized because it separates *what a conversation is* (sections), shows channels as `# name` text rows, and keeps dense, quiet rows.
- Nothing helps find "what needs me": unread, mentions and threads are only per-row badges.

## Goals

1. **Sections** the person controls: the sidebar groups conversations into collapsible sections. Defaults are automatic; people can create their own sections ("carpetas") and drag channels into them.
2. **Meeting channels stop polluting**: channels created by calls are marked as meetings, live in their own collapsed section, and auto-archive after inactivity.
3. **A denser, Slack-like sidebar** and quick filters (all / unread / mentions), without losing mobile friendliness.
4. **A "Menciones y actividad" view** (what needs me) as the first entry.
5. A short list of the Slack features still missing, ordered, for later specs (not built here).

## Non-goals

- Shared channels between companies, slash commands, interactive message buttons, apps directory (later specs, see the end).
- Changing how messages, threads or calls work.
- A new realtime stack: sections are per-person preference data.

## Design

### 1. Sections

Each person has an ordered list of sections. A section has `id, name, icon?, collapsed, position`, and holds conversations. Two kinds:

- **Automatic sections** (cannot be deleted, can be reordered, collapsed or hidden): `Destacados` (pinned), `Canales`, `Mensajes directos` (direct + groups), `Reuniones` (meeting channels), `Soporte externo` (only when the person has support access), `MirAI` stays pinned at the very top as today.
- **Custom sections** ("carpetas"): created from the sidebar menu ("Nueva sección"), renamed, reordered, deleted (its conversations fall back to their automatic section). A conversation lives in at most one custom section; without one it appears in its automatic section.

Moving: drag a row onto a section header (desktop) or "Mover a sección..." in the row menu (touch and keyboard; drag is never the only way). Sections have a per-person unread total on the header when collapsed.

**Storage.** Per-person data, so it uses the existing `UserPreference` pattern, not a new table: key `chat.sidebar` with `{ sections: [{ id, name, icon, collapsed, position }], assignments: { [conversationId]: sectionId }, hidden: [automaticSectionKey], order: [automaticSectionKey] }`, validated server-side (max 20 sections, name 40 chars, ids must be this person's conversations, unknown ids dropped on read). Endpoints: `GET|PUT /chat/sidebar`. No migration.

### 2. Meeting channels

- Conversations created by a call get `metadata.origin = 'meeting'` (and `callId`). One migration-free change in the call service where it creates the channel; existing meeting channels are recognized by a cheap rule (title starts with the meeting naming pattern or `metadata.callId`), and the owner can move any channel into "Reuniones" by hand.
- The `Reuniones` section is collapsed by default, rows show the date, and it is excluded from the "Canales" count.
- **Auto-archive**: a worker job archives meeting channels with no message or call in 14 days (archived chats already exist and stay searchable and restorable). The window is per company (`InstanceConfig`-free: constant 14, adjustable later).
- Starting a group call from an existing channel does NOT create a new channel (already true for channels; keep it).

### 3. Sidebar look and quick filters

- **Rows**: channels render as `# nombre` text with a small unread dot or count (no big avatar); direct messages keep a small avatar (24 px) with presence dot; groups use a stacked mini-avatar; meetings use a video icon. Row height ~32 px desktop, 44 px on touch (target size). Last-message preview moves out of the row into a tooltip/second line only for DMs.
- **Header**: workspace-style title with the "+" menu (Nuevo mensaje, Nuevo canal, Explorar canales, Nueva sección, Nueva reunión).
- **Quick filters** under the search box: Todo, Sin leer, Menciones (chips; the choice is remembered per person).
- **Visual identity** (project rules): tokens only, `rounded-md` controls, flat tinted selection (no ring or glow), section headers as quiet small text with a chevron, no emojis, Spanish text, light and dark.
- The list is virtualized when it has more than 100 rows.

### 4. "Menciones y actividad"

First entry of the sidebar (above sections): one list of what needs the person: unread mentions, replies in their threads, reactions to their messages, invitations to channels. It reuses `/work/mentions` and the thread/reaction notifications already stored, grouped by day, each item opening the message (`?msg=`). Mark all as read.

### 5. Roadmap of what Slack has and we do not (separate specs, in this order)

1. Custom status and "No molestar" with schedule (also pauses digests and push).
2. Save for later (message bookmarks) and reminders (`/remind`, "recordarme de esto").
3. Slash commands (`/crear-tarea`, `/llamar`, `/estado`) as a registry that modules can extend.
4. Interactive messages (buttons for approve/reject from approvals and purchases).
5. Scheduled messages and message drafts across devices.
6. Apps directory for the integrations built in the previous phase.
7. Shared channels between companies (last, largest).

## Data and API

- `GET /chat/sidebar` returns the person's sections + assignments (defaults when empty); `PUT /chat/sidebar` replaces them (validated). The conversation list endpoint gains `origin` (from metadata) so the client can place meetings without extra calls.
- Worker: `meeting-channel-archive-job` (idempotent, uses the existing archive path).
- No Prisma migration.

## Permissions and security

- Sidebar data is only the caller's own; assignments to conversations they are not a member of are dropped. Archive job acts only on conversations with `origin = 'meeting'` and no activity, never on channels created by people.
- Drag/move and section CRUD require no extra permission (personal organization).

## Testing (lean)

- Unit: sidebar normalization (limits, unknown ids dropped, defaults), automatic section placement rules (pinned, meeting, channel, direct/group), archive-job selection (inactive meetings only).
- E2E: create sections, move a channel by menu and by drag, filters, reload keeps everything; call-created channel lands in Reuniones; archive job archives an old meeting channel and leaves a normal one; "Menciones y actividad" lists a mention and opens it. Screenshots at desktop and phone width, light and dark.

## Rollout order

1. Sidebar data + automatic sections + new row design + filters (visible improvement first).
2. Custom sections with move by menu and drag.
3. Meeting origin, "Reuniones" section and auto-archive.
4. "Menciones y actividad".
5. Docs (help text for Chat), TASKS, MirAI context mention if needed.

## Open decisions (defaults chosen)

- Sections are personal, not shared by the company (default). Company-wide sections can come later.
- A conversation belongs to one custom section at most (default; Slack does the same).
- Meeting channels auto-archive after 14 days without activity (default).
- Channels show as `# nombre` rows without avatar; direct messages keep a small avatar (default).
