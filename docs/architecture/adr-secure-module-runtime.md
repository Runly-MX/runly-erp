# ADR: Secure Module Runtime for RME3

- Status: **Proposed** (F1B.3, for review). No runtime infrastructure is built until this is accepted.
- Date: 2026-11-23
- Context documents: `docs/architecture/2026-11-23-rme3-threat-model.md`, `docs/architecture/2026-11-23-rme3-capability-gateway-contract.md`, `docs/audits/RUNLY_PLATFORM_F1B_SECURITY_RESULTS.md`.

## Context

Today every RME3 module, official or not, runs inside the API process (and
the worker for automations/events) with the global Prisma client, every
secret in `process.env` and the shared event loop. Its React components run in
the shell's own browser realm, where the session token lives in
`localStorage`. F1A/F1B contained *who* may introduce code and quarantine
code that was never trusted, but a trusted module is still all-powerful
(threat model T6, T7, T10, T11, T15).

Constraints: self-hosted installs (Linux VPS with Docker via the installer),
developers on Windows, a single-company or multi-company instance, the
existing RME3 ecosystem (Builder-generated modules, a few hand-written ones),
and no appetite for heavy operations.

Non-goal: a worker thread, a child process or Node `vm` alone is not a
security boundary against hostile code; they share the user, filesystem and
network of the API.

## Options

**A. Host-interpreted declarative runtime.** Modules are data (ModuleDefinition:
entities, fields, relations, views, layouts, automations, permissions). The
host interprets them; no module JavaScript runs on the server. Builder output
stops generating `api/*.js` / `models/*.js` and the host serves generic CRUD,
relations, files, automations and events from the definition.

**B. External processes with OS isolation.** One process per module under a
separate Unix user with seccomp/landlock, cgroups and a network namespace.

**C. Restricted containers/sandboxes on demand.** A "module runner" container
per module (or per trust domain) without database credentials or host env,
read-only filesystem, CPU/memory/pids limits, no egress by default, talking
to the host only through the capability gateway with a per-module identity.
On a VPS this is Docker (the installer already runs Docker); optionally
gVisor/Firecracker later.

**D. Hybrid.** A for everything that can be declarative (the default and the
whole Builder), C for the few modules that need custom server code, and an
isolated browser surface for custom components regardless of A or C.

## Evaluation

| Criterion | A Declarative host | B OS processes | C Containers | D Hybrid (A + C) |
|---|---|---|---|---|
| Security vs hostile code | Strongest: no code | Good on Linux only, complex to get right | Strong (kernel namespaces, no secrets, no DB creds); gVisor optional | Strong |
| Request latency | Lowest (in-process interpretation) | +IPC (sub-ms local socket) | +HTTP hop to runner (~1–3 ms local) | Low for most, +hop only for code modules |
| Memory | None extra | One Node per module (~40–80 MB) | One container per code module (~60–100 MB) | Only code modules pay |
| Operational complexity | Low | High (users, seccomp profiles, supervisor) | Medium (installer already manages Docker; runner image + lifecycle) | Medium, bounded to code modules |
| Windows / Linux / Docker | All | Linux only | Linux + Docker Desktop on Windows | All (code modules need Docker) |
| Local / self-hosted | Yes | Hard | Yes (installer profile, like `runly-dwg`) | Yes |
| Multi-company scale | Excellent | Poor (process per module) | Good (per-module runners, scale to zero) | Good |
| Compatibility with existing RME3 | Builder modules: high (definition already exists); hand-written `api/` code: none | Needs a host↔module protocol anyway | Needs the capability gateway; hand-written modules adapt their data access | Builder: transparent; code modules: adapt to gateway |
| Expressiveness | Limited to what the host implements | Full | Full, through capabilities | Full where justified |

## Decision (recommended)

**Option D.**

1. **Declarative by default (A).** Builder modules become host-interpreted:
   the definition is the artefact; the compiler stops emitting server JS for
   them. This removes the compiler as a code authority (two escapes were
   found in F1B.0) and makes Builder modules safe for company admins by
   construction.
2. **Code modules in a runner container (C).** A module that ships server
   code runs in `runly-module-runner` (new installer profile), one container
   per module, with: no `DATABASE_URL`/service role/JWT secret; only its own
   per-module secrets; read-only root, tmpfs; `--cpus`, `--memory`,
   `--pids-limit`; egress denied except an allowlist declared in the manifest
   and approved by the owner; a short-lived module identity token. All data
   and services go through the capability gateway.
3. **Isolated browser surface for custom components.** Custom components
   render in a sandboxed iframe on a separate origin (no `allow-same-origin`
   with the shell, no access to the shell's storage), talking to the shell
   through a postMessage bridge that exposes the same capability contract.
   Official components keep rendering in-realm.
4. **Quarantine and code authority (F1A/F1B.1) stay** as the gate in front of
   everything.

## Consequences

- Developers lose direct Prisma and raw SQL in module code; they gain a
  stable, versioned capability API (`docs/architecture/2026-11-23-rme3-capability-gateway-contract.md`).
- Instances that want code modules need Docker (already true for installer
  installs). Without Docker, only declarative modules run; code modules stay
  quarantined with a clear reason.
- Windows development of code modules uses Docker Desktop; declarative
  modules need nothing.
- The Builder's expressiveness is bounded by the host; gaps found later are
  filled in the host, not by escape hatches.

## Migration plan (gradual)

| Step | Change | Exit criterion |
|---|---|---|
| M0 | Done: code authority (F1A), Builder escapes closed, quarantine + inventory (F1B.1) | `pnpm test:security`, `verify-module-security.mjs` green |
| M1 | Capability gateway PoC: one capability (company-scoped CRUD on the module's own entity) served to an isolated runner | PoC test: runner has no Prisma, no host env; cross-company read denied; quota enforced |
| M2 | Host-interpreted CRUD for Builder entities behind a flag; compare against generated code for every template | Same API responses for every template; generated server JS no longer imported for flagged modules |
| M3 | Builder publishes declarative-only packages by default; existing Builder modules republished | Inventory shows no Builder module with server JS |
| M4 | Runner container + gateway for code modules; module SDK v2; Developer docs | One real code module migrated end to end in staging |
| M5 | Sandboxed iframe surface for custom components + bridge | Component cannot read shell storage or call the API without the bridge (browser test) |
| M6 | Remove in-process loading of third-party server code; keep quarantine for anything left | Route loader refuses non-official server code; official modules unaffected |

Each step is shipped and verified in staging before the next; no step deletes
module data.

## Rejected

- **B alone**: Linux-only, high operational cost, still needs the gateway.
- **Node `vm`, worker threads, child processes as the boundary**: same user,
  filesystem and network; not a security boundary.
- **Signature-only trust**: proves provenance, not safety.
