# atlas.chat — Current State Spec

**Date:** 2026-08-30
**Module:** `atlas.chat` (Discord/WhatsApp-style realtime chat — channels, groups,
direct messages, external/guest widget). Shipped 2026-08-27.
**Status:** Post-audit reference (2026-08-30 pass, same rigor as `atlas.ledger`).

> **Update 2026-10-11 (Runly Meet v2):** channel links are now 1:N (primary
> channel), meetings have access modes + meeting ID/PIN, meetings can start
> without ringing, and the call room/guest room were rebuilt
> (`calls/layout`, `calls/controls`, `calls/panel`, `calls/people`, `calls/ui`).
> See `docs/superpowers/specs/2026-10-11-runly-meet-v2-*.md`; the call-room
> layout notes below predate that work.

---

## 1. Layout

```
apps/api/src/routes/chat/
  index.js                          (948 — was 1122, over the CLAUDE.md 1000-line
                                      limit; extracted moderation-routes.js +
                                      template-routes.js)
  moderation-routes.js               (158, new) mute/block/unblock/groups-in-common/reports
  template-routes.js                 (89, new) message templates (quick-reply snippets)
  chat-service.js                    (1304 — was 1370) core conversation/message CRUD
  chat-attachments-service.js        (149, new) presign upload / signed URL / delete attachment
  chat-conversation-reads-service.js (228) listConversations/getConversation/archive
  chat-permissions-service.js        (304) channel roles, assertChannelPermission
  chat-moderation-service.js         mute, block/unblock, reports
  chat-reactions-service.js  chat-mentions-service.js  chat-entity-references-service.js
  chat-channel-links-service.js      module<->channel linking (Proyectos/Calendario/Calls)
  channel-directory-service.js       guest-service.js (509, external/guest widget)
  chat-reply-preview.js
  __tests__/  10 files (183 tests)
apps/desktop/src/modules/atlas.chat/
  components/  ChatWindow.jsx (940), MessageComposer.jsx (913, uses @atlas/ui
    MentionTextarea), MessageAttachments.jsx (768), ChatMessageBubble.jsx (768),
    FloatingChatHub.jsx, MiniChatWindow.jsx, ThreadPanel.jsx, PinnedMessagesSheet.jsx,
    MessageActionSheet.jsx, MessageReactionPicker.jsx, ForwardMessageModal.jsx, ...
  screens/  ExternalInboxScreen.jsx (622), ChatTemplatesScreen.jsx
  widget/  ExternalChatWidget.jsx — standalone embeddable script for third-party
    websites, deliberately has no @atlas/ui dependency (see Section 4)
```

## 2. Access control

Every mutating/reading path resolves `auth_user_id -> user_profile.id`
(`resolveUserProfileId`, 10-min process cache) then checks membership:

- `assertMember(conversationId, profileId)` — used directly by
  `updateConversation`, `deleteConversation`, `addMembers`, `removeMember`,
  `listMessages`, `sendMessage`, `listPinnedMessages`, `markConversationRead`,
  `presignAttachmentUpload`.
- `editMessage`/`deleteMessage`/`deleteAttachment` gate by
  `sender_user_id = profileId` directly in SQL — correct, since you can only
  touch content you authored.
- `listThreadReplies`/`getAttachmentSignedUrl` fold the membership check into
  the same query (`INNER JOIN chat_conversation_members ... AND left_at IS
  NULL`) rather than a separate `assertMember` call, so a nonexistent id and
  an id the caller isn't a member of both 404 identically — same
  non-leaking convention `pinMessage` already documents (spec Section 12).
- Channel/group role permissions (`messages.pin`, `members.manage`, etc.) go
  through `chat-permissions-service.js`'s `assertChannelPermission`.

67 chat routes across `index.js`/`moderation-routes.js`/`template-routes.js`
are permission-gated; `rbac-granular-contract.test.js` (6/6) confirms every
manifest-declared `chat.*` permission is in `permission-catalog.js` — no gaps
found (this module was already covered by the earlier RBAC-catalog closure
pass in this campaign).

## 3. Cross-tenant fix (2026-08-30)

**`createConversation` and `addMembers` inserted a client-supplied
`user_profile` id into `chat_conversation_members` with zero validation that
it belonged to the caller's company.** Any authenticated chat user (holding
only the ordinary `chat.conversations.create` permission) could pass an
arbitrary UUID as a member and be silently joined into a private
direct/group/channel conversation with a user from a completely different
company — the desktop member picker is already company-scoped, but the API
itself did not enforce it, which is the actual trust boundary per CLAUDE.md
("No direct database access from the frontend. The API is the authority for
all business rules, validation, and permissions."). Same bug class as
`atlas.calendar`'s `shareCalendar` and `atlas.projects`' `addMember`, found
earlier in this campaign.

**Fix:** added `filterCompanyPeers(actingProfileId, candidateIds)` to
`chat-service.js` — same pattern as `calendar-event-service.js`'s attendee
guard: resolves the acting user's enabled company memberships, then restricts
the candidate ids to those sharing at least one of those companies (always
allowing self-reference). Applied to:

- `createConversation` — right after resolving the creator's profile id,
  before the self-chat check, the direct-conversation uniqueness lookup, or
  any insert. A mismatch throws `403 "Uno o mas usuarios no pertenecen a tu
  empresa."` before any write.
- `addMembers` — after `assertMember` + the existing
  `assertChannelPermission` check (so the guard fires even when the caller
  legitimately holds `members.manage` — company boundary is orthogonal to
  in-conversation role).

`chat-tenant.test.js` (new, 4 tests) proves: `createConversation` (group and
direct) rejects a foreign-company member with 403 before any `$executeRaw`
write; `addMembers` rejects a foreign-company id both with and without a
permission grant.

## 4. File-size remediation (2026-08-30)

- `index.js` had crossed the CLAUDE.md 1000-line limit (1122, flagged
  explicitly in CLAUDE.md itself). Extracted two self-contained route blocks:
  `moderation-routes.js` (`createModerationRoutes`: mute, block/unblock,
  groups-in-common, reports) and `template-routes.js`
  (`createTemplateRoutes`: message templates). `index.js` is now 948 lines.
- `chat-service.js` was 1370 lines. Extracted the attachment upload-presign /
  signed-URL / delete trio (`presignAttachmentUpload`, `getAttachmentSignedUrl`,
  `deleteAttachment`) into `chat-attachments-service.js`, a sub-factory that
  receives its dependencies (including the shared signed-URL cache helpers)
  from `createChatService()`, mirroring how `chat-conversation-reads-service.js`
  was already split out. Now 1304 lines — still over the 1000-line soft limit,
  under the 1500 hard ceiling; the remaining large functions (`sendMessage`
  ~288 lines, `listMessages` ~129) are deeply coupled to mentions/entityRefs/
  notifications/broadcaster and were judged too risky to split in this pass —
  tracked as D7-a in the backlog rather than forced through.
- `ExternalChatWidget.jsx` is the one place with a raw `<textarea>` /
  no-`@atlas/ui` markup in the whole module — it is a standalone embeddable
  script meant to run on third-party customer websites (like Intercom/Crisp),
  so it deliberately carries no dependency on the internal design system.
  Confirmed as a correct, deliberate exception, not a UI-first violation.

## 5. Known gaps / follow-ups (backlog)

- **D7-a** — `chat-service.js` still 1304 lines; further extraction deferred,
  same call as `pos-routes.js` (POS5) / `calendar-routes.js` (D2-a).
- **D7-b** — the guest widget's `listGuestMessages` returns each attachment's
  raw `object_key`, but there is no guest-facing signed-URL route (only the
  member-only `getAttachmentSignedUrl` exists) — guests can attach files but
  have no way to view attachments back. Functional gap, not a security issue
  (a bare `object_key` can't be turned into a working URL without a signing
  endpoint that doesn't exist for guests) — needs a product decision on
  whether guest attachment viewing is in scope.
- No responsive/browser QA performed this session (no live browser tooling
  used); recommend the standard 390px/1440px pass per
  `docs/ai-context/ui-screen-audit-checklist.md`.

## 6. Verification (2026-08-30)

- `node --check` on `index.js`, `moderation-routes.js`, `template-routes.js`,
  `chat-service.js`, `chat-attachments-service.js` — pass.
- `node --test "apps/api/src/routes/chat/__tests__/*.test.js"` — 183/183
  (was 179; +4 new `chat-tenant.test.js` tests). Two pre-existing tests needed
  their `buildPrismaMock` updated with a `membership.findMany` default (same
  stale-mock pattern seen throughout this campaign whenever a real fix adds a
  new Prisma call the mock didn't anticipate).
