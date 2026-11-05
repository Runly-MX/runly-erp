# External Identity and realms

External Identity is Runly's login system for people who are **not Runly users**: customers of a company's website today, LMS students and supplier portals tomorrow. It lives in `apps/api/src/services/external-identity/` and is module-agnostic.

Spec: `docs/superpowers/specs/2026-11-04-external-identity-design.md`.

## Why not Supabase Auth

Runly users sign in with Supabase Auth. External accounts deliberately do not, for three reasons:

1. **One pool per instance.** Supabase Auth keeps a single user pool, so an email is unique across the whole instance. A shopper could not hold separate accounts on two different sites.
2. **Tokens the ERP trusts.** Every Supabase session is a JWT the Runly API accepts. Shoppers would be one forgotten permission check away from the ERP.
3. **Mixed user lists.** External people would show up next to employees, and every user list, search and admin screen would need to filter them out.

External Identity has its own tables, its own password hashing and its own sessions. No row is ever created in `auth.users`, `UserProfile`, `Membership` or roles.

## What a realm is

A **realm** is the space an account belongs to. It is identified by the module that owns it and an id inside that module:

| Realm | `moduleKey` | `ownerId` |
|---|---|---|
| Customers of one website | `runly.website` | site id |
| Students of one LMS portal (future) | `runly.lms` | portal or course id |
| Suppliers of one inventory portal (future) | `runly.inventory` | portal id |

Rules the engine enforces:

1. **Accounts are unique per realm, not per instance.** The constraint is `(realm_id, email)`. `ana@x.com` can hold two unrelated accounts on two sites, with different passwords, and neither site can see the other.
2. **Every lookup happens inside a realm.**
   - A session token, verification link or reset link is only valid in the realm that issued it.
   - The engine checks `realmId` on every session and token it reads.
   - Admin lookups go through `(realm, accountId)`, never through a bare account id.
3. **A realm belongs to one company** (`company_id`). Companies never share realms.
4. **A realm starts disabled.** The owning module turns it on (website: "Cuentas de clientes" in the site settings).

### Realm settings

- `enabled`: while false, every public route of the realm answers 404 and existing sessions stop resolving.
- `allowSignup`: while false, only existing accounts can sign in.
- `requireEmailVerification`: when true, an account must confirm its email before it can sign in.
- `sessionDays`: how long a session lasts (1 to 365 days, default 30).

## Data model

All four tables are core Prisma models; ids are UUID v7.

- **`external_realm`**: `company_id`, `module_key`, `owner_id`, the settings above. Unique on `(module_key, owner_id)`.
- **`external_account`**:
  - `realm_id`, `company_id`, `email` (lowercased), `password_hash`, `display_name`, `phone`, `email_verified_at`, `status` (`active` | `disabled`).
  - `contact_id`: an optional link to a company Contact.
  - Lockout counters: `failed_logins`, `locked_until`.
- **`external_session`**: `account_id`, `realm_id`, `token_hash` (SHA-256 of the cookie value), `expires_at`, `revoked_at`.
- **`external_account_token`**: single-use email links, with `purpose` set to `verify_email` or `reset_password`, plus `token_hash`, `expires_at` and `used_at`.

## Security guarantees

- **Passwords** are hashed with `node:crypto` scrypt (N=2^15, r=8, p=1, 16-byte salt) and stored as `scrypt$N$r$p$salt$hash`. Because the parameters are stored per hash, they can be raised later without breaking existing passwords. Passwords must be 10 to 128 characters.
- **Tokens** are 32 random bytes. The database only stores their SHA-256, so a leaked database cannot be used to sign in or to open links.
- **Session cookie:**
  - It is named `__Host-rx_session` over HTTPS and `rx_session` on plain-HTTP local dev.
  - It is set by the realm's own host with `HttpOnly; Secure; SameSite=Lax; Path=/`.
  - The browser never sends it to another site.
  - It is not a bearer token, so no ERP route can accept it.
- **CSRF:** mutating routes require `Content-Type: application/json` and a same-host `Origin`. A cross-site HTML form cannot produce that request.
- **No account enumeration:**
  - A wrong password and an unknown email give the same answer, and an unknown email still runs a scrypt comparison so timing does not leak it.
  - "Forgot password" always answers 204.
  - With verification on, registering an existing email looks like a new sign-up; only the inbox owner gets an "already registered" email.
- **Brute force:**
  - Per-IP rate limits: login 10/min, register 5/min, email-sending routes 3/min.
  - A per-email login limit.
  - After 10 consecutive failures the account is locked for 15 minutes.
  - An optional human check (`verifyHuman`) on register.
- **Revocation:**
  - Resetting the password signs out every session.
  - Changing the password signs out every session except the current one.
  - Disabling an account signs it out everywhere, and the next request answers 401.
  - Email links are single use: a conditional update stops two concurrent uses from both succeeding.

## Engine API

```js
import { createExternalIdentity, createExternalAuthRouter, requireExternalAccount } from '../services/external-identity/index.js'

const identity = createExternalIdentity({
  prisma,
  // Build the link and send the email. kind: verify_email | reset_password | already_registered.
  // context.origin is the host the visitor used, so links come back to the same name.
  notify: async ({ realm, account, kind, token, context }) => { /* ... */ },
  // Optional, runs once after an account is created (website links a Contact here).
  onRegistered: async ({ realm, account }) => { /* ... */ },
})
```

Both `notify` and `onRegistered` are best effort. If one fails, the error is logged and the account is kept.

| Method | Purpose |
|---|---|
| `ensureRealm({ companyId, moduleKey, ownerId })` / `findRealm({ moduleKey, ownerId })` / `updateRealm(realm, data)` | Realm lifecycle |
| `register`, `login`, `logout`, `sessionFromToken` | Sign-up and sessions |
| `requestEmailVerification`, `verifyEmail`, `requestPasswordReset`, `resetPassword` | Email links |
| `updateProfile`, `changePassword` | Self service |
| `listAccounts`, `setAccountStatus`, `revokeSessions` | Admin, always by realm |

Errors are `ExternalIdentityError` with `status` and `code`: `INVALID_CREDENTIALS`, `LOCKED`, `EMAIL_NOT_VERIFIED`, `SIGNUP_CLOSED`, `EMAIL_TAKEN`, `TOKEN_INVALID`, `VALIDATION_ERROR`, `INVALID_PASSWORD`, `NOT_FOUND`.

### HTTP router

`createExternalAuthRouter({ identity, resolveRealm, verifyHuman? })` returns a Hono router with these routes:

| Method | Path | Notes |
|---|---|---|
| POST | `/register` | `{ email, password, displayName, phone?, turnstileToken? }`. Answers 201 with `{ account }` plus the cookie, or `{ verificationRequired: true }`. |
| POST | `/login` | `{ email, password }`. Answers `{ account }` plus the cookie. |
| POST | `/logout` | Answers 204 and clears the cookie. |
| GET / PATCH | `/me` | Reads the profile, or updates `{ displayName?, phone? }`. |
| POST | `/me/password` | `{ currentPassword, newPassword }`. |
| POST | `/verify-email/request` | Signed in only; sends a new verification email. |
| POST | `/verify-email` | `{ token }` |
| POST | `/password/forgot` | `{ email }`. Always answers 204. |
| POST | `/password/reset` | `{ token, password }` |

`account` is `{ id, email, displayName, phone, emailVerified }`. It never carries the hash, the company or the contact.

`requireExternalAccount({ identity, resolveRealm })` is middleware for a module's own visitor routes, for example "my orders" or "my courses". It sets `c.get('externalAccount')`, `c.get('externalSession')` and `c.get('externalRealm')`, and answers 401 otherwise.

## How the website uses it (reference consumer)

File: `apps/api/src/routes/website/accounts-routes.js`.

**Public routes** are mounted at `/public/website/account/*` on the site's own host. `website-origin-guard.js` allows that path on public hosts.

**Realm resolution:** `resolveRealm(c)` runs `gateway.resolve(c)` (host → published site) and then `findRealm({ moduleKey: 'runly.website', ownerId: site.id })`. It returns no realm when the site is unpublished or the realm belongs to another company.

**Emails:**
- Sent with `createCompanyMailer` and the `buildExternalAccountEmail` template.
- The copy names the site, never Runly.
- Links land on `/cuenta?accion=verificar&t=…` and `/cuenta?accion=restablecer&t=…`. The template's account block renders those pages.

**Contacts:** on sign-up, a company Contact with the same email is linked (never overwritten). If none exists, one is created with type `customer` and tag `cliente-web`.

**Human check:** Turnstile runs on register when the site has a key.

**Admin routes** (ERP, authenticated):

| Method | Path |
|---|---|
| GET / PUT | `/website/sites/:siteId/account-settings` |
| GET | `/website/sites/:siteId/accounts?search&status&limit&offset` |
| PATCH | `/website/sites/:siteId/accounts/:accountId` with `{ status }` |
| POST | `/website/sites/:siteId/accounts/:accountId/revoke-sessions` |

**Permissions:** reading requires `website.accounts.read` and managing requires `website.accounts.manage`. For compatibility they are aliased to `website.site.read` and `website.site.update`.

**Audit:** admin actions are recorded in `AuditLog` as `website.accounts.settings_update`, `website.account.disable`, `website.account.enable` and `website.account.sessions_revoke`.

**SDK** (`client.website.*`): `getAccountSettings`, `updateAccountSettings`, `listAccounts`, `setAccountStatus`, `revokeAccountSessions`.

## Adopting it in another module (LMS example)

1. **Pick the realm owner.** Example: one realm per LMS portal, `('runly.lms', portalId)`.
2. **Decide how a request maps to the realm.** It can be the host (a portal on its own domain) or the path. If the path carries the owner id, the session cookie should be scoped to that path, or the realm must be resolved from a value the visitor cannot swap between realms.

   ```js
   const resolveRealm = async (c) => {
     const portal = await findPublishedPortal(c.req.param('portalId'))
     return portal ? identity.findRealm({ moduleKey: 'runly.lms', ownerId: portal.id }) : null
   }
   ```

3. **Create the identity.** Supply a `notify` that builds links to the module's own pages, and optionally an `onRegistered`, for example to create the learner row.
4. **Mount the router:** `app.route('/public/lms/portal/:portalId/account', createExternalAuthRouter({ identity, resolveRealm }))`.
5. **Protect the module's visitor routes** with `requireExternalAccount({ identity, resolveRealm })`. Store `externalAccount.id` on the module's own rows, such as enrollments or orders.
6. **Add admin screens and permissions** in the owning module (`<module>.accounts.read|manage`) that call `listAccounts`, `setAccountStatus` and `revokeSessions` with the module's realm.

Nothing in the engine changes for a new consumer.

## Testing

- **Unit tests:** `node --test apps/api/src/services/external-identity/__tests__/external-identity.test.js`. They cover realm isolation, verification, lockout, single-use reset links, disabled accounts and JSON-only mutations.
- **Real-DB end-to-end** (git-ignored local script): `.e2e/external-identity-e2e.mjs`.

## Not in v1

- Sign-in with an emailed one-time code (passwordless).
- Social login and passkeys.
- One realm shared by several sites.
- Moving LMS guests and the supplier portal onto realms.
- CSV export of accounts.

See section 28 of the spec.
