# Platform owner (instance-level administration)

Status: approved 2026-10-18 (user decision in chat: oldest admin becomes owner; transferable).

## 1. Problem

Instance settings (instance name, description, default time zone and currency,
Web Push VAPID keys) are one global row set shared by every company hosted on
the installation. Today:

- every company admin (`runly.admin`) gets every permission, including
  `core.instance.update` and `platform.settings.manage`, and the Web Push guard
  explicitly admits `isAdmin`: the admin of company B can change settings for
  all companies;
- `checkProtectedRoleAssignment` lets a company admin assign `system.admin`, so
  any company admin can promote themselves to platform admin;
- no user holds `system.admin` and no flow assigns it (dev DB: 4 companies,
  all admins are `runly.admin`).

## 2. Goals

- Exactly one platform owner per instance, transferable.
- Instance settings and Web Push editable only by the owner when the instance
  hosts more than one company; single-company instances keep today's behavior
  (that company's admins may edit).
- Close the `system.admin` self-promotion hole.
- Owner cannot be lost by accident; a server-side recovery path exists.

## 3. Model

- `InstanceConfig` key `platform_owner_profile_id` = `UserProfile.id` of the owner.
  No schema change.
- `isPlatformOwner(context)` = `context.profile.id === owner`. Legacy: a user
  with a global `system.admin` membership still counts as system admin
  (`isSystemAdmin`), but the owner is the one source for instance gates.
- Owner id is loaded with the per-request user context (same parallel round
  trip as permissions) and exposed as `tenantContext.isPlatformOwner`.

## 4. Bootstrap

- `/setup/initialize`: the admin profile created there becomes the owner.
- Forward migration (`prisma/migrations/20261110000000_platform_owner`): when the key
  is absent, set it to the profile of an enabled user with a global
  `system.admin` membership if any, else the oldest enabled membership with role
  `runly.admin` (by membership `created_at`, enabled user and company).

## 5. Gates

`requireInstanceAdmin(c)`: allowed when `isPlatformOwner`, or when the instance
has exactly one enabled company and the caller is that company's admin.
Applied to: `PUT` instance general settings, every `/settings/notifications/webpush*`.
`GET` stays as today (read for everyone who could read before).

`system.admin` role assignment (`checkProtectedRoleAssignment`): only the
platform owner (or legacy system admin).

## 6. Transfer and protection

- `GET /platform/owner` (auth): `{ owner: { id, displayName, email } | null, isOwner, multiCompany }`.
- `POST /platform/owner/transfer` `{ profileId }`: caller must be the owner;
  target must be an enabled, non-bot user with at least one enabled membership
  in an enabled company, and not the caller. Writes the key, AuditLog entry
  (`platform.owner.transferred`, from/to). Returns the new owner.
- Disabling or deleting the owner's account (identity user routes) or their
  last enabled membership returns 409 "Transfiere la propiedad de la plataforma
  antes de dar de baja esta cuenta."
- Recovery: `node scripts/set-platform-owner.mjs --email <email>` run on the
  server (DATABASE_URL from env); sets the key, prints only the display name.

## 7. UI (runly.core InstanceSettings)

- New card "Propietario de la plataforma": owner name/email; for the owner a
  "Transferir propiedad" action (Dialog with user `ComboboxField`, MirAI/bots
  excluded, then `ConfirmDialog` explaining the consequence).
- Multi-company and not owner: General and Web Push forms read-only with an
  `Alert` "Estos ajustes afectan a todas las empresas de la instancia. Solo
  <owner> puede cambiarlos."
- SMTP tab label "Correo de esta empresa".

## 8. Tests

Unit: owner resolution in context, gate (owner / single-company admin /
multi-company admin denied), transfer validation, protected role assignment,
disable-owner guard. Migration SQL reviewed; applied to dev DB.
