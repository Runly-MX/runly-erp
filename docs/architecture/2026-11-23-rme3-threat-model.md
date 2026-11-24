# RME3 threat model (F1B.2)

Status: for review. Scope: every way module code or module data reaches the
API process, the worker, PostgreSQL and the user's browser. Evidence lives in
`docs/audits/RUNLY_PLATFORM_F1B_SECURITY_RESULTS.md`.

A signature proves who published a package and that it was not altered. It
does not prove the code is safe. Trust below is always "trusted to run with
the privileges listed", never "known to be harmless".

## 1. Actors and trust levels

| Actor / artefact | Who controls it | What it can do today | Trust |
|---|---|---|---|
| Runly Core (`apps/api`, `apps/worker`, official manifests) | Runly release | Everything | Full (it is the host) |
| Official modules (official catalog, pinned signature) | Runly release | Code in the API process, global Prisma, all env | High: same publisher as Core, but a compromise of the signing key equals RCE on every instance |
| Declarative / Builder modules | Company admin edits a ModuleDefinition; the server compiles it | Generated code in the API process | Medium: only as safe as the compiler (two escapes fixed in F1B.0) |
| Builder extensions (React screens, `views/*.custom.js`) | Developer, delivered by an owner-approved ZIP | Server import at staging/discovery; browser code | Same as third-party code |
| Third-party modules with code (ZIP, community/managed catalog) | Any developer | API process, global Prisma, all env, browser session | Untrusted. Contained (owner-only + quarantine), not isolated |
| Developer Mode (detached Builder project) | Developer through ZIP | Same as third-party code | Untrusted |
| Company administrator (`runly.admin`) | One tenant | Every permission of their company | Tenant-scoped. Must never authorize instance-wide code |
| System administrator role (`system.admin`) | Instance | Cross-company permissions | Not a code authority |
| Platform owner | Instance operator | Instance settings, code authorization, quarantine decisions | Highest human authority; still a human reviewing code |
| Server operator (shell/DB access) | Infrastructure | Everything | Outside the application boundary |

## 2. Assets

Tenant data (all companies share one database and one Prisma client), secrets
in `process.env` (service role key, JWT secret, SMTP, OAuth, payment keys),
the user's browser session (Supabase access and refresh tokens in
`localStorage`), the migration history and schema, the module packages on
disk, availability of the shared API/worker processes.

## 3. Trust boundaries

1. HTTP → API (authentication, tenant resolution, RBAC).
2. API → module code: **no boundary today**. Module code runs in the API
   process (`route-loader-service.js` factory with `prisma`, `cache`, env).
3. Worker → module code (automations, event handlers): no boundary today.
4. Browser shell → module components: **no boundary today**. Bundles are
   `import()`ed into the app realm (`apps/desktop/src/shell/ModuleBundleLoader.jsx:23`),
   no CSP on the shell, session readable from `localStorage`.
5. PostgREST → PostgreSQL (anon/authenticated grants, RLS).
6. Package source → disk (code authority at staging, F1A) and disk → execution
   (trust record per exact bytes, F1B.1).

## 4. Threats (STRIDE-oriented)

| # | Threat | Vector | Today | Control in place | Residual |
|---|---|---|---|---|---|
| T1 | Arbitrary server code by a company admin | ZIP upload/check | Blocked | Owner-only authority (F1A) | — |
| T2 | Same, through the Builder | String field default / PWA short name emitted raw into server-imported files | **Was open; fixed F1B.0** | `JSON.stringify` emission + fuzz test over every template value | Fields absent from templates are only covered by the validator and review |
| T3 | Same, through Builder extensions | Client-sent `definition.extensions` with `views/*.custom.js` | **Was open; fixed F1B.0** | Client may only keep/remove recorded files; publish checks per-file hashes | Projects whose extensions were recorded before F1B have no hash record → publish refuses until the owner re-uploads |
| T4 | Old untrusted code keeps running | Modules installed before F1A/F1B | Blocked | Quarantine at every import point (F1B.1) | Owner must review each `OWNER_CODE_REVIEW` module |
| T5 | Code changed on disk after install | Shell access, backup restore of an untrusted revision | Quarantined | Hash of exact bytes vs trusted list (last 10) | An attacker with shell access is outside the model |
| T6 | Trusted module reads secrets | `process.env` in the API process | **Open** | None (same process) | F1B.3 runtime isolation |
| T7 | Trusted module reads another company | Global Prisma client, raw SQL | **Open** | Convention only (`companyId` from context) | F1B.3/F1B.4 |
| T8 | Privilege escalation through the host | Module calls host services with forged `companyId`/user | Partly open | Module services derive company from the request; direct Prisma bypasses it | Capability gateway (F1B.4) |
| T9 | Package tampering in transit | Catalog download | Mitigated | Signatures, pinned official keys, digest, anti-rollback | Managed/community keys are admin-configurable (owner still required to install) |
| T10 | Malicious dependency inside a module | Module bundles its own deps | Open | Bundler compiles components; server code imports from `node_modules` of the host | Isolation + dependency allowlist |
| T11 | Resource exhaustion | Infinite loop, memory, sync I/O in module code | **Open** | None (shares the event loop) | Isolation with CPU/memory/time limits |
| T12 | SSRF | Module `fetch` to internal addresses; automation HTTP step | Partly mitigated | `automation-http-service.js` host allowlist + DNS checks for Builder automations | Module code can still `fetch` anything |
| T13 | Unauthorized migrations | Package schema changes | Mitigated | Schema plan, decisions, drift detection, owned tables; core tables forbidden | Data migrations run in-process (`data:` import) |
| T14 | Migration history tampering | PostgREST write to `_prisma_migrations` | Fixed F1A | Grants revoked (migration 20270114000000) | Apply on every instance |
| T15 | Browser session theft by module components | Component code reads `localStorage`, calls the API as the user, any company the user belongs to | **Open** | None | F1B.5: isolated origin / sandboxed iframe + CSP |
| T16 | Exfiltration through allowed services | Module uses a granted service (notifications, files, documents) to send data out | Partly open | Service grants per module (`/modules/:key/service-grants`) | Gateway quotas, audit, egress policy |
| T17 | Cross-tenant effect of instance-global modules | A company admin installs/updates a module for all companies | Mitigated | Builder modules opt-in per company (`company_module`); install/update need instance authority | Builder namespace remains instance-global |

## 5. Security requirements derived

1. No module code in the API or worker process (T6, T7, T10, T11).
2. Company, user and permissions are always derived by the host, never taken
   from module input (T7, T8).
3. Every capability is denied by default, granted per module, audited,
   rate-limited and revocable (T8, T12, T16).
4. Module browser code never shares the realm, origin or storage of the shell
   (T15).
5. Code that runs is identified by exact bytes and an authority (T1–T5).
6. Signature = provenance; review or isolation = safety (T9).
