# External Identity — implementation plan

Spec: `docs/superpowers/specs/2026-11-04-external-identity-design.md`

## Task 1 — Engine (core, module-agnostic)

- Prisma models `ExternalRealm`, `ExternalAccount`, `ExternalSession`, `ExternalAccountToken` + forward migration.
- `apps/api/src/services/external-identity/`
  - `crypto.js` — scrypt hash/verify, random tokens, sha256.
  - `identity-service.js` — `createExternalIdentity({ prisma, sendMail, now })`: realms, register, login, sessions, email tokens, profile, admin.
  - `auth-router.js` — `createExternalAuthRouter({ identity, resolveRealm, links, verifyHuman })`, cookie handling, rate limits, `requireExternalAccount`.
  - `__tests__/` — focused unit tests with an in-memory prisma fake (hashing, isolation, lockout, token reuse, cookie never valid on another realm).
- Architecture doc `docs/architecture/external-identity-realms.md`: what a realm is, how to adopt it from another module (LMS example), security guarantees.

## Task 2 — Website as first realm

- Realm resolver from the site gateway (`gateway.resolve(c)` → `('runly.website', site.id)`), only when the realm is enabled.
- Mount `/public/website/account/*`; allow the path in `website-origin-guard.js`.
- Admin routes `/website/sites/:siteId/accounts*` and `/account-settings`; permissions `website.accounts.read|manage` (catalog + manifest); audit log on admin actions.
- Email: verification and reset emails built with the Runly email layout and sent with `createCompanyMailer`.
- SDK `client.website.accounts.*`.

## Task 3 — UI

- Admin: "Cuentas de clientes" section in the site settings screen (switches + `RunlyTable` + `ConfirmDialog`).
- Public runtime: one `account-portal` block that renders sign-in / register / recover / reset / verify / profile from the URL; `/cuenta` page in the Mercado and Tienda templates; header "Mi cuenta" points to `/cuenta`.

## Verification

- `node --test apps/api/src/services/external-identity/__tests__/`
- `pnpm lint`, `pnpm build:web`
- Real API smoke test against the local dev API (register/login/me/logout on a site host; cookie rejected on another site and on an ERP route).
