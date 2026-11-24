# RME3 Capability Gateway contract (draft, F1B.4)

Status: **draft for review**. It replaces direct Prisma/env access for module
code that runs outside the host (ADR `adr-secure-module-runtime.md`). The
proof of concept (M1) is built only after the ADR is accepted.

## Principles

1. **Deny by default.** A module can call only capabilities declared in its
   manifest (`capabilities`) and granted for this instance by the platform
   owner (official modules: granted by the release).
2. **Verifiable module identity.** Each runner receives a short-lived token
   (Ed25519, ≤ 5 min, renewed by the host) binding `moduleKey`, the trusted
   package hash (module-trust.js) and the capability grant version. A token
   for a quarantined or changed package is never issued.
3. **The host derives the context.** Company, user, roles and permissions come
   from the user's request as resolved by the host (`tenantContext`), passed to
   the runner as an opaque, signed *request context* that the gateway
   re-verifies. A `companyId`, `userId` or permission sent by the module is
   ignored or rejected.
4. **Permission checked on every operation**, against the user's permissions
   in the request's company and the module's grant.
5. **Quotas and limits** per module and per company: requests/min, rows per
   call, payload bytes, concurrent calls, files bytes/day, notifications/hour,
   outbound HTTP calls/min.
6. **Versioned contract**: `runly.capabilities/v1`; additive changes only
   within a version; old versions served for two releases.
7. **Revocation**: removing a grant, quarantining the module or rotating its
   key invalidates tokens at the next renewal (≤ 5 min) and immediately for
   new calls via a revocation counter checked per call.
8. **Idempotency** for every write: `Idempotency-Key` per call, stored 24 h per
   module+company.
9. **Audit**: every write and every denied call is recorded
   (`audit_log`, entity `RunlyModuleCapability`).

## Envelope

```
POST /internal/capabilities/v1/{capability}
Authorization: Module <module identity token>
X-Runly-Request-Context: <host-signed context, opaque to the module>
Idempotency-Key: <uuid>          (writes)
{ "args": { ... } }

200 { "data": ..., "meta": { "quota": { "remaining": 118 } } }
4xx { "error": "CAPABILITY_DENIED|PERMISSION_DENIED|QUOTA_EXCEEDED|INVALID_ARGS|CONTEXT_INVALID|MODULE_REVOKED", "message": "..." }
```

The gateway listens only on the internal network shared with runners, never
on the public port.

## Capabilities v1

| Capability | Args (module-supplied) | Host-derived | Rules |
|---|---|---|---|
| `records.list/get/create/update/archive` | `entity`, filters, page, record id, fields | company, user | Only the module's own entities; company filter injected by the host; soft delete only; field allowlist from the definition |
| `relations.resolve` | target type, ids | company, user | Only targets declared in the manifest; reuses `relationTargets.resolve` with the user's access |
| `files.upload/signedUrl/attach` | entity, record id, file metadata | company, user | Size/MIME allowlist (files-service), per-day bytes quota, signed URLs ≤ 5 min |
| `notifications.publish` | recipients (profile ids), template, payload | company, sender | Recipients must be members of the company; rate limit per hour |
| `events.emit` / `events.subscribe` | event key, payload | company | Only keys declared in `events.emits` / `events.subscribes`; payload size limit |
| `jobs.enqueue` | job key, payload, run at | company | Declared job keys; max pending per module+company |
| `automations.run` | automation key, record id | company, user | Same engine and permissions as Builder automations |
| `integrations.http` | method, URL, headers, body | — | Only hosts in the manifest's `egress` list approved by the owner; DNS rebinding and private ranges blocked (reuse `automation-http-service.js` checks); response size/time limits |
| `secrets.get` | secret name | module | Only secrets stored for this module (encrypted, set by the owner); never host secrets |
| `audit.record` | action, entity, details | company, actor | Appends only |

## What the module never gets

`DATABASE_URL`, Prisma, raw SQL, the service role key, the JWT secret, other
modules' secrets, the user's access/refresh token, cross-company queries,
filesystem outside its tmpfs, unrestricted network.

## PoC scope (M1, after ADR acceptance)

One runner container with one module that calls `records.list` and
`records.create` on its own entity. Tests: (1) the runner process has no
`DATABASE_URL`, no Prisma client and none of the host's secret env names;
(2) a request in company A cannot read or write company B records even if
the module sends B's id; (3) a module without the grant gets
`CAPABILITY_DENIED`; (4) the 121st call in a minute gets `QUOTA_EXCEEDED`;
(5) a revoked module gets `MODULE_REVOKED` on the next call; (6) a runner
exceeding its memory limit is killed without affecting the API.
