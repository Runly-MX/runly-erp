# Inventory areas, scoped visibility and external supplier portal

Date: 2026-10-20. Status: approved direction (user, 2026-10-20). Plan follows in `docs/superpowers/plans/`.

## Problem
`inv_item` hangs only from `company_id`: anyone with `inventory.item.read` sees every item of the company. Companies need to segment inventory by area/team, let people see only the areas they belong to, keep full visibility for higher roles, and give suppliers a simplified inventory view without access to the portal.

## Decisions
- Items belong to exactly one area (`inv_item.area_id`, nullable). Null = "General" (all existing data, no backfill rows needed).
- Areas are folders and can nest (`parent_id`). Membership in an area grants access to its descendants.
- Supplier access uses guest invitations (magic link), not company users with an "external" role.
- Everything ships in three independent phases; each is verified and committed on its own.

## Data model (new forward migration; never edit applied ones)
- `inv_area`: id uuid v7, company_id, name, parent_id (self, nullable), enabled, created_by_id, timestamps. Unique (company_id, parent_id, lower(name)) among enabled.
- `inv_area_member`: id, area_id, user_id (nullable), guest_id (nullable), role `viewer | editor | manager`, status, invited_by, timestamps. Check: exactly one of user_id/guest_id. Unique per (area_id, user_id) and (area_id, guest_id).
- `inv_item.area_id` uuid nullable, index (company_id, area_id).
- Phase 3: `inv_guest` (company_id, email, name, contact_id nullable, enabled, last_seen_at) and `inv_guest_invite` (guest_id, token hash, expires_at, used_at), modeled on `LmsGuestInvite`/`CallGuest`.

## Permissions
- `inventory.scope.all`: sees every item regardless of area. Admins implicit. Granted to roles through the existing RBAC.
- `inventory.area.manage`: create/rename/move/disable areas and manage members. Area `manager` can manage members of their own areas without it.
- Existing `inventory.item.*` keep meaning "may do X" and now apply only within the visible scope.

## Scope rules (single source of truth)
`inventoryScope(ctx)` in `apps/api/src/services/inventory-scope.js` returns `{ all: true }` or `{ areaIds: [...] , includeOwn: bool, userId, employeeId }`, and `inventoryScopeWhere(scope)` builds the Prisma/SQL filter:
- `all` -> no filter.
- Otherwise item visible if `area_id` in the user's areas (descendants resolved with a recursive CTE, cached per request), OR (`includeOwn` and (`created_by_id = user` OR currently assigned/in active custody to the user's employee)).
- Items with `area_id` null are visible only with `scope.all` (plus the own-items rule).
- Writes: create requires editor/manager on the target area (or scope.all); update/delete/move require editor/manager on the item's current area and, for moves, the destination; users with scope.all keep current permission behavior.
- `includeOwn` is a company-level instance setting (`InstanceConfig` key `inventory.scope.includeOwn`, default true).

Every read path must use the helper: items list/detail/search/dashboard/trends, scan and public-token resolution (internal side), labels, custody (items picked and custody lists), assignments, import/export, intake, MirAI queries/actions, MCP inventory adapter, canvas data sources, notifications and activity links. Deliverable of phase 1 includes an audit table of every call site and a test that runs a limited user against all of them.

## UI
- Inventory sidebar/header gets an area tree filter ("Todas", "General", folders). Item form gets "Area" (`CreatableComboboxField`). Bulk "Mover a area".
- Areas screen (Dialog/Sheet standard, `RunlyTable`): tree, members with role, invite user or supplier. All text in Spanish.
- Users without scope.all see only their folders; an `EmptyState` explains when they have none.

## Phase 1 - Areas and scoped visibility
Migration, `inventory-scope.js`, permission catalog entries, area CRUD + members endpoints (`routes/inventory/area-routes.js`), apply the helper to every read/write path, UI (tree filter, area field, areas screen), docs (`docs/ai-context/rme3-runtime-capabilities.md`, MirAI capabilities doc). Tests: scope helper unit tests, cross-user isolation test over the audited endpoints.

## Phase 2 - "Mis inventarios"
`includeOwn` rule wired in scope, setting toggle in inventory admin, a "Mios" quick filter for everyone (including scope.all users) = created by me or in my custody.

## Phase 3 - Supplier portal
- Manager invites a supplier (email, optional contact link, areas + role). Magic link to `/app/p/inventory/<token>`; session is an `inv_guest` JWT scoped to inventory only, separate from user sessions, with no access to any other API.
- Guest API under `/inventory/guest/*`, always scoped to the guest's areas via the same `inventoryScope` (guest variant). Capabilities: list/search/view items, create and edit items, adjust status, upload files, view history. No custody documents, catalogs admin, pricing/purchase fields, other areas or users.
- Simplified UI (own route, reuses `RunlyTable`/forms with a reduced field set). Revocation and invite expiry from the areas screen; audit entries tag the actor as guest.
- Rate limiting and token hashing like existing public/guest flows.

## Out of scope
Multi-area items, per-item ACLs, guest access to other modules, supplier self-registration.

## Verification
`node --test` for scope helper and endpoint isolation, `pnpm lint`, `pnpm build:web`, real API boot plus curl with a limited user and a guest token (placeholders only), developer docs untouched unless module API changes.
