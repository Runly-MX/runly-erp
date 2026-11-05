# External Identity (accounts outside Runly)

## 1. Feature title

External Identity: a reusable login system for people who are not Runly users (website customers first; LMS students and supplier portals later).

## 2. Status

Proposed

## 3. Context

Website templates (Tienda, Aurora, etc.) show "Mi cuenta", "Favoritos" and checkout, but a published site has no way for a visitor to register or sign in. The only existing mechanism, `apps/api/src/services/storefront-auth-service.js`, creates a real Supabase user plus `UserProfile` and a company role, so a shopper becomes a Runly user of the company.

Other modules already solved the same need ad hoc: LMS guest learners (`routes/lms/lms-guest-access.js`, access code + rotated guest token) and the inventory supplier portal (`routes/inventory/guest/*`). Each one carries its own hashing, rate limiting, and session code.

## 4. Problem

1. Site visitors cannot have accounts that are fully separate from Runly.
2. Supabase Auth is one user pool per instance: an email is unique instance-wide, and every token it issues is a JWT the Runly API trusts. Using it for shoppers would tie their accounts together across sites and make them candidates for ERP access.
3. Each module that needs outside accounts reimplements credentials, sessions, and lockout.

## 5. Goals

1. An account belongs to exactly one **realm** (for example, one website). The same email can hold unrelated accounts in different realms, with different passwords.
2. Outside accounts never touch Supabase Auth, `UserProfile`, `Membership`, or roles, and their credentials are never accepted by any ERP route.
3. A module can adopt the system by declaring a realm resolver and mounting one router, with no copy of the auth logic.
4. Website is the first consumer: register, sign in, sign out, verify email, reset password, "Mi cuenta" profile, and linking the account to a company `Contact`.
5. The company can see and manage each realm's accounts from the module that owns it.

## 6. Non-goals

1. Social login (Google, Apple), passkeys, or 2FA in v1.
2. Single sign-on across realms, even within the same company.
3. Promoting an outside account to a Runly user. If it is ever needed, it will be an explicit invitation from Runly, not a conversion.
4. Migrating LMS guests or the supplier portal in v1. They are designed for, not moved.
5. Order history UI ("Mis pedidos") beyond exposing the linked contact id; it ships with the checkout work.

## 7. User stories

1. As a visitor to servitech.sites.runlyapp.io, I want to create an account with my email and password so that I can check out faster and see my data.
2. As that same person, I want to register on catalogy.sites.runlyapp.io with the same email and a different password, and find no trace of my servitech account there.
3. As a site visitor who forgot my password, I want to receive a reset link by email.
4. As a company admin, I want to see who registered on my site, disable an account, and sign it out everywhere.
5. As a module developer (LMS, portals), I want to reuse the same accounts engine by declaring my realm.

## 8. UX requirements

- Public site (template blocks, Spanish labels): "Iniciar sesión", "Crear cuenta", "Mi cuenta", "Cerrar sesión", "¿Olvidaste tu contraseña?", "Verifica tu correo". The header "Mi cuenta" icon opens sign-in when anonymous and the account page when signed in.
- Error messages never reveal whether an email is registered: sign-in failures answer "Correo o contraseña incorrectos."; reset requests always answer "Si el correo está registrado, te enviamos un enlace."
- Admin (runly.website, site settings): a "Cuentas de clientes" section with an on/off switch, "Permitir registro", "Exigir verificación de correo", and a `RunlyTable` of accounts (correo, nombre, verificado, último acceso, estado) with actions "Desactivar", "Reactivar" and "Cerrar sesiones" (`ConfirmDialog`).
- Follows the Runly UI rules: `@runly/ui` components, fixed header/footer dialogs, no native dialogs.

## 9. Routes/screens

Admin (owner module `runly.website`):

- `/app/website/sites/:siteId/settings` — new "Cuentas de clientes" section (settings + accounts table).

Public site (served on the site host, rendered by the website runtime):

- `/cuenta/ingresar`, `/cuenta/registro`, `/cuenta/recuperar`, `/cuenta/restablecer?t=...`, `/cuenta/verificar?t=...`, `/cuenta` — template blocks, so each template can style them.

## 10. Data model

All tables are core (Prisma-managed); UUID v7 ids; every row carries `company_id`.

**ExternalRealm**: one per consumer instance.
- `id`, `companyId`, `moduleKey` (for example `runly.website`), `ownerId` (for example the site id), `enabled`, `allowSignup` (default true), `requireEmailVerification` (default true), `sessionDays` (default 30), `createdAt`, `updatedAt`.
- Unique `(moduleKey, ownerId)`.

**ExternalAccount**
- `id`, `realmId`, `companyId`, `email` (normalized: trimmed, lowercased), `passwordHash`, `displayName`, `phone?`, `emailVerifiedAt?`, `status` (`active` | `disabled`), `contactId?` (FK to `Contact`, same company), `failedLogins`, `lockedUntil?`, `lastLoginAt?`, `createdAt`, `updatedAt`.
- Unique `(realmId, email)`. This is what isolates realms.

**ExternalSession**
- `id`, `accountId`, `realmId`, `tokenHash` (unique, SHA-256 of the cookie value), `expiresAt`, `lastSeenAt`, `userAgent?`, `revokedAt?`, `createdAt`.

**ExternalAccountToken**: single-use email links.
- `id`, `accountId`, `purpose` (`verify_email` | `reset_password`), `tokenHash` (unique), `expiresAt`, `usedAt?`, `createdAt`.

Credentials:
- Passwords are hashed with `node:crypto` scrypt (N=2^15, r=8, p=1, 16-byte salt), stored self-describing as `scrypt$N$r$p$salt$hash`, and compared with `timingSafeEqual`.
- Session and link tokens are 32 random bytes in base64url; only their SHA-256 is stored.

## 11. Prisma impact

- New models: `ExternalRealm`, `ExternalAccount`, `ExternalSession`, `ExternalAccountToken`.
- Relations: `Company` (cascade on delete), `Contact` (`onDelete: SetNull`).
- One new forward migration. No existing model changes.

## 12. API contract

### Engine (in-process, `apps/api/src/services/external-identity/`)

- `createExternalIdentity({ prisma, mailer, clock? })` returns:
  - `ensureRealm({ companyId, moduleKey, ownerId, defaults })`
  - `register`, `login`, `logout`, `sessionFromToken`
  - `requestEmailVerification`, `verifyEmail`, `requestPasswordReset`, `resetPassword`
  - `updateProfile`, `changePassword`
  - Admin: `listAccounts`, `setAccountStatus`, `revokeSessions`, `updateRealm`
- `createExternalAuthRouter({ identity, resolveRealm, cookie, links })` is a Hono router any module mounts.
  - `resolveRealm(c)` returns the realm for the request, or null. For website it is the gateway's host → site lookup.
  - `links(realm)` builds absolute verify/reset URLs for the email.
- `requireExternalAccount({ identity, resolveRealm })` is middleware that sets `c.get('externalAccount')`.

### Public routes (website mount: `/public/website/account/*`, same origin as the site)

All of these require the request host to resolve to an enabled realm; otherwise they answer 404.

| Method | Path | Body | Response | Errors |
|---|---|---|---|---|
| POST | `/register` | `{ email, password, displayName, turnstileToken? }` | `201 { account }` + cookie (or `{ verificationRequired: true }`) | 403 `SIGNUP_CLOSED`, 422 `VALIDATION_ERROR` |
| POST | `/login` | `{ email, password }` | `{ account }` + cookie | 401 `INVALID_CREDENTIALS`, 423 `LOCKED`, 403 `EMAIL_NOT_VERIFIED` |
| POST | `/logout` | — | `204`, clears cookie | — |
| GET | `/me` | — | `{ account }` | 401 `UNAUTHENTICATED` |
| PATCH | `/me` | `{ displayName?, phone? }` | `{ account }` | 401, 422 |
| POST | `/me/password` | `{ currentPassword, newPassword }` | `204`; revokes other sessions | 401, 422 |
| POST | `/verify-email/request` | — (signed in) | `204` | 401 |
| POST | `/verify-email` | `{ token }` | `{ account }` | 400 `TOKEN_INVALID` |
| POST | `/password/forgot` | `{ email }` | `204` always | 429 |
| POST | `/password/reset` | `{ token, password }` | `204`; revokes all sessions | 400 `TOKEN_INVALID`, 422 |

- `account` is `{ id, email, displayName, phone, emailVerified }`. It never includes the hash, company, or contact id.
- **Cookie:**
  - Name: `rx_session`, prefixed `__Host-` when served over HTTPS.
  - Attributes: `HttpOnly; Secure; SameSite=Lax; Path=/`, with `Max-Age` equal to `sessionDays`.
  - Set by the site host itself, so the browser never sends it to another site.
- **Rate limits** (per IP and per realm+email, using `createTokenBucketLimiter`):
  - login 10/min
  - register 5/min
  - forgot 3/min
- **Lockout:** after 10 consecutive failures the account is locked for 15 minutes.
- **Turnstile:** checked on register when the site has a key.

### Admin routes (`/website/sites/:siteId/accounts*`, authenticated ERP)

- `GET /website/sites/:siteId/accounts?search&status&limit&offset` returns `{ data, total }`.
- `PATCH /website/sites/:siteId/accounts/:accountId` takes `{ status }` and returns `{ data }`.
- `POST /website/sites/:siteId/accounts/:accountId/revoke-sessions` returns `204`.
- `GET|PUT /website/sites/:siteId/account-settings` reads or writes `{ enabled, allowSignup, requireEmailVerification, sessionDays }`.

## 13. SDK contract

`client.website.accounts`:
- `list(siteId, query)`
- `update(siteId, accountId, body)`
- `revokeSessions(siteId, accountId)`
- `getSettings(siteId)`
- `updateSettings(siteId, body)`

The public site runtime calls the public routes with `fetch(..., { credentials: 'same-origin' })` through its own small client, not the ERP SDK.

## 14. Validator contract

`packages/validators` gets:
- `externalRegisterSchema`, `externalLoginSchema`, `externalProfileSchema`, `externalPasswordChangeSchema`
- `externalForgotSchema`, `externalResetSchema`
- `externalRealmSettingsSchema`, `externalAccountStatusSchema`

Rules: email max 254; password 10–128 characters; displayName 1–120.

## 15. Module manifest impact

`runly.website` official manifest gains the permissions in section 18. There is no new module: the engine is core platform code, like files or audit.

## 16. Navigation impact

N/A. The admin UI is a section inside existing site settings.

## 17. Blueprint impact

N/A. The template blocks are website blocks: `account-login`, `account-register`, `account-recover`, `account-reset`, `account-verify`, `account-profile`, added to `block-catalog.json`.

## 18. RBAC/permissions

- `website.accounts.read` guards `GET` accounts and settings.
- `website.accounts.manage` guards `PATCH` account, revoke sessions, and `PUT` settings.

Both are granted to company admin roles by the seed. Public routes need no Runly permission; their trust boundary is the realm resolved from the host.

## 19. Multi-company behavior

- A realm belongs to one company.
- Every engine query filters by `realmId`, and admin routes also check `site.companyId === tenant.companyId`.
- The contact link only accepts a `Contact` of the realm's company.
- Two companies, or two sites of the same company, never share accounts.

## 20. Files/storage impact

N/A (no avatars in v1).

## 21. Export/import requirements

CSV export of a realm's accounts (correo, nombre, verificado, alta, último acceso) is deferred; see section 28.

## 22. Audit log requirements

Admin actions are recorded in `AuditLog` with the ERP user as actor:
- `website.account.disable`
- `website.account.enable`
- `website.account.sessions_revoke`
- `website.accounts.settings_update`

Each entry stores the before/after of the changed fields. Visitor actions (login, register) are not audit-logged. The account keeps `lastLoginAt`, and sessions keep their own trail.

## 23. Edge cases

1. The same email registers on two sites: two independent accounts, and neither site reveals the other.
2. A custom domain plus the `*.sites.runlyapp.io` host of the same site: each host gets its own cookie, so the visitor signs in once per host. This is accepted in v1.
3. The site is unpublished or the realm is disabled: public routes answer 404 and existing sessions stop resolving, without being deleted.
4. An account is disabled while signed in: the next `/me` answers 401 and the session is revoked.
5. Register is called with an already-registered email: the visitor sees the same generic outcome and, if verification is on, the owner gets a "someone tried to register" email instead of a second account.
6. A reset token is used twice or after expiry (1 h; verify links last 24 h): `TOKEN_INVALID`.
7. A password reset or change revokes the other sessions.
8. An unknown email on login still runs a scrypt comparison against a dummy hash, so timing does not reveal registered emails.
9. When the contact link is on, registration finds or creates a `Contact` by email in the company. An existing contact is linked, never overwritten.
10. Email sending fails: the account is still created, and the visitor can ask for a new verification link.

## 24. Risks

1. **An ERP route accepts the cookie by mistake.** Mitigation: the cookie is not a JWT and has its own name; ERP auth middleware only reads `Authorization: Bearer`. A test asserts that an ERP route answers 401 with only the cookie.
2. **Credential stuffing.** Mitigation: per-IP and per-email limits, lockout, and Turnstile on register.
3. **scrypt CPU cost under load.** Mitigation: about 50 ms per hash at N=2^15; the rate limits bound it, and parameters are stored per hash so they can be raised later.
4. **Session table growth.** Mitigation: the worker deletes expired or revoked sessions and used tokens daily.

## 25. Acceptance criteria

1. Given accounts are enabled on site A and B, when `ana@x.com` registers on A, then registering `ana@x.com` on B succeeds with another password and logging in on B with A's password fails.
2. Given a session cookie from site A, when it is sent to site B's `/public/website/account/me`, then the answer is 401.
3. Given a valid external session cookie, when it is sent to any ERP route, then the answer is 401.
4. Given an external account, then no `auth.users`, `UserProfile`, or `Membership` row exists for it.
5. Given 10 wrong passwords, when the 11th attempt has the right one, then the answer is 423 until the lock expires.
6. Given a reset link, when it is used, then a second use answers `TOKEN_INVALID` and older sessions are revoked.
7. Given `requireEmailVerification`, when an unverified account logs in, then the answer is `EMAIL_NOT_VERIFIED`.
8. Given an admin disables an account, when the visitor calls `/me`, then the answer is 401.
9. Given a user without `website.accounts.read`, when they list accounts, then the answer is 403.

## 26. Verification plan

- `node --test apps/api/src/services/external-identity/__tests__/` covers hashing, tokens, lockout, and realm isolation with an injected prisma fake.
- Postgres E2E on a disposable runner covers acceptance criteria 1–9 through real HTTP with cookies.
- `pnpm lint` and `pnpm build:web`.
- Playwright against a published test site: register, sign out, sign in, reset, and the admin table shows the account.

## 27. Rollback plan

- Turn the realm off per site (`enabled=false`) to stop all public routes immediately.
- For a full revert, remove the router mount and the template blocks. The four tables are new and referenced by nothing else, so a forward migration can drop them. No existing data changes.

## 28. Future enhancements

1. Move LMS guest learners and the inventory supplier portal onto realms.
2. Email-code (passwordless) sign-in.
3. Social login and passkeys.
4. CSV export of accounts.
5. "Mis pedidos" and saved addresses on top of `contactId`.
6. Sharing one realm across several sites of the same company (opt-in), and cross-host sign-in for custom domains.
