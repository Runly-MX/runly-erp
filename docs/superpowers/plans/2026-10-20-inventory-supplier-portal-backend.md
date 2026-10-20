# Inventory Areas - Phase 3 (supplier portal, backend only) Plan

Spec: `docs/superpowers/specs/2026-10-20-inventory-areas-scoping-design.md` (Phase 3). UI is a separate batch built from the HTTP contract in the final report.

## Precedents reused
- LMS guest invites (`routes/lms/lms-invite-*.js`, `lms-guest-mail.js`): link token + optional 8-char code (`newAccessCode`, `hashAccessCode`, `verifyAccessCode`, `createAttemptGuard`), `Authorization: Guest <token>`, opaque 32-byte token with only sha256 stored, mail via `createCompanyMailer` + `buildMail` + `getBrand`, manual link fallback when mail is off.
- Public gateway: `routes/inventory/item-public-routes.js` (`createTokenBucketLimiter`, per-IP key), mounted before `mountWithAuth` in `index.js`.
- Scope: `services/inventory-scope.js` (`scopeWhere`, `canWriteArea`, `expandAreaRoles`) with a guest variant `{ all:false, roles, own:null, guest:{id} }`.

## Data (one forward migration, additive)
- `inv_guest` (company, email, name, contact_id, enabled, last_seen_at, created_by_id) + partial unique `(company_id, lower(email)) WHERE enabled`.
- `inv_guest_invite` (guest_id, company_id, token_hash unique, code_hash null, expires_at, used_at, revoked_at, sent_at, created_by_id).
- `inv_guest_session` (guest_id, invite_id, token_hash unique, expires_at, revoked_at, last_seen_at): opaque session tokens, hash only (instant revocation; chosen over a JWT because every LMS/call guest flow already uses hashed opaque tokens).
- `inv_area_member`: `user_id` nullable, `guest_id` nullable FK, CHECK exactly one, unique `(area_id, guest_id)`, role of a guest limited to viewer|editor by CHECK.
- Company deletion is catalog-driven (company_id + FK propagation), so the new tables are covered; a test pins that they carry `company_id`.

## Code
- `services/inventory-guest-core.js` pure helpers (tokens, hashes, email normalisation, TTLs, errors).
- `services/inventory-guest-service.js` invitations (invite/list/resend/remove/revoke) and sessions (start/authenticate/refresh).
- `services/inventory-guest-items.js` reduced write schema, response allowlist, guest scope, guest-tagged audit bridge, files.
- `routes/inventory/guest/guest-public-routes.js` (`POST /public/inventory/guest/session`), `guest/guest-routes.js` (`/inventory/guest/*`, own `Authorization: Guest` middleware), `guest-invite-routes.js` (user routes, `inventory.area.manage` or manager of the area).
- `listMembers` returns guests with `kind: 'guest'`; user membership code keeps working with the nullable `userId`.

## Tasks (TDD, one commit each)
1. Schema + migration + `pnpm db:migrate/generate`.
2. Core + scope guest variant + invitation/session service tests.
3. Guest items service (reduced fields, allowlist, audit tagging) tests.
4. Guest routes + public session route + isolation tests (other area, other company, non-guest routes, escalation, viewer write, forbidden fields, revoked, user token on guest routes).
5. Invitation routes + members listing + mail template + mounting in `index.js`.
6. Docs (`rme3-runtime-capabilities.md`, `TASKS.md`), lint, suites.
