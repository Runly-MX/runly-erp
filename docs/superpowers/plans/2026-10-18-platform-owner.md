# Plan: platform owner

Spec: `docs/superpowers/specs/2026-10-18-platform-owner-design.md`

1. Migration `prisma/migrations/20261110000000_platform_owner/migration.sql` (forward,
   idempotent `INSERT ... WHERE NOT EXISTS`); apply to dev with
   `prisma db execute --file`, then `migrate resolve --applied`.
2. API core: load owner id in `_loadUserContext` (parallel), expose
   `isPlatformOwner` in tenant context; `lib/platform-owner.js` with
   `requireInstanceAdmin`, `getPlatformOwner`, `transferPlatformOwner`,
   `assertNotPlatformOwner`; setup/initialize sets the key.
3. Gates: instance PUT, Web Push routes, `checkProtectedRoleAssignment`,
   identity disable/delete user and membership routes.
4. Routes `GET /platform/owner`, `POST /platform/owner/transfer`; SDK methods.
5. Recovery script `scripts/set-platform-owner.mjs`.
6. UI: InstanceSettings owner card, transfer dialog, read-only mode, SMTP label.
7. Tests (node --test), lint, build:web, browser check of settings screen.
