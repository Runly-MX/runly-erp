# Execution supervisor: design, threat model and recovery (F1B Stage 3)

Status: experimental reference (`apps/supervisor`). Not deployed and not in the installer compose yet.

## Role

The supervisor is the only Runly process that talks to Docker. The API asks it to run a backend extension job. Module code never reaches it: module containers sit on an `--internal` network whose only peer is the gateway proxy.

Access to the Docker socket is equivalent to root on the host. The supervisor's code is kept small and its interface closed for that reason.

## Interface

`POST /v1/jobs`, `POST /v1/modules/:key/cancel` and `GET /v1/health`. All three require an HMAC-SHA256 signature computed over the method, path, timestamp, nonce and body, with a shared secret of at least 32 bytes:

- a timestamp skew over 30 s is rejected;
- each nonce is accepted only once;
- the body may not exceed 64 KB.

### Job contract (strict schema)

The request carries only these fields:

| Field | Constraint |
|---|---|
| `jobId` | UUID |
| `moduleKey` | `custom.*` |
| `packageHash` | sha256 |
| `handler` | `backend/<name>.mjs` |
| `profile` | Allowlisted profile name |
| `timeoutMs` | Up to the profile's maximum |
| `input` | Up to 32 KB |
| `callToken` | — |

Unknown fields are rejected, including `image`, `mounts`, `network` and `command`.

### Profiles

Profiles live in the supervisor's own code (`PROFILES`). Each one fixes:

- an image pinned by digest;
- memory, CPU, PID and time limits.

The module chooses none of these.

### Module code

The supervisor resolves the module's code from its own `RUNLY_SECURE_RUNTIME_MODULES_DIR`. It then recomputes the trust hash and refuses the job (`PACKAGE_HASH_MISMATCH`) unless the hash equals the `packageHash` the API sent.

## Container profile (per job)

- **User and privileges:** runs as uid/gid 65534, with every capability dropped and `no-new-privileges`.
- **Filesystem:** read-only root; `/tmp` is a tmpfs of 16 MB mounted `noexec,nosuid`. The module code and the runner are bind-mounted read-only.
- **Limits:** memory (no swap), CPU, PIDs and file descriptors.
- **Network:** an `--internal` network whose only exit is the gateway proxy.
- **Environment:** nothing from the host. The token, gateway address and input arrive on stdin.
- **Labels:** each container carries `runly.runtime` and `runly.module`, used to cancel every job of a module.

## State and recovery

`stateDir/jobs.jsonl` is an append-only ledger with the states `ACCEPTED`, `RUNNING`, `SUCCEEDED`, `FAILED` and `INTERRUPTED`.

### On start

Every job still `ACCEPTED` or `RUNNING` is recorded as `INTERRUPTED` and is **not** re-run. A resubmitted `jobId` gets `409 JOB_ALREADY_SEEN`.

Execution is at most once. Retrying is the caller's decision and uses a new `jobId`.

### Shutdown

Shutdown does not wait for running jobs. They are recorded as interrupted on the next start. A crash also takes the per-job timeout timers down, so on every start the supervisor kills every container labelled `runly.runtime` (orphans) and audits how many it killed.

### Restoring after a crash

1. Restart the supervisor.
2. Check `GET /v1/health`.
3. Review the `INTERRUPTED` entries in the ledger.
4. Orphan containers are already killed on start (`orphans.reaped` in the audit log). They carry no state worth keeping.

## Revocation

When the platform owner removes a module's capabilities (`PUT .../grants` with an empty list), two things happen:

- The API's gateway rejects the module's tokens at once, including tokens held by jobs already running.
- The API calls `cancel` on the supervisor, which `docker kill`s every container labelled with that module.

## Threat model

| Threat | Control | Residual |
|---|---|---|
| A module asks for a privileged container | There are no container parameters in the contract | — |
| A forged or replayed request | HMAC, timestamp window and single-use nonce | The secret must be rotated if the API is compromised |
| The code on disk was changed | Hash recomputed by the supervisor | Changes made by someone with host write access are outside the model |
| Resource exhaustion | Per-job limits, a concurrency limit and a bounded queue (`RUNTIME_BUSY`) | Under sustained load, Docker's own capacity |
| Container escape | Non-root, no capabilities, seccomp default, NNP, read-only | Kernel and runc vulnerabilities. Mitigations: gVisor (`runsc`) as an extra profile, rootless Docker |
| Supervisor compromise | Small surface; not reachable by modules or end users | It holds the Docker socket. Run it on an internal network only and, where possible, with rootless Docker |
| Leaked tokens in logs | The audit log records only job, module and result | — |

## Fail-closed profile preflight (Stage 4)

Before the first job of a profile, the supervisor starts one throwaway container with **exactly** the job's flags (`hardeningArgs` in `orchestrator.js`, no network) and reads what the kernel reports (`isolated/profile-check.js`). Custom code is refused (`503 RUNTIME_DISABLED`, `failed` lists the checks) unless all of these hold:

| Check | What is read |
|---|---|
| Non-root | uid 65534 |
| Capabilities dropped | `CapEff` and the bounding set `CapBnd` are zero (`CapBnd`, because a non-root user has no effective capabilities even when none were dropped) |
| `no-new-privileges` | `NoNewPrivs: 1` |
| Seccomp | `Seccomp: 2` (filter active) |
| PID and memory limits | `pids.max` and `memory.max` match the profile |
| No network | only `lo` |
| Read-only root | the `/` mount carries `ro`, and a write fails |
| No Docker socket | neither socket path exists |
| Namespaces and mounts blocked | `unshare -U` and `mount` fail |
| `/tmp` is `noexec` | an executable copied there does not run |
| Clean environment | no variable matching secret, token, key, password or database URL |
| Image pinned | the image reference ends in `@sha256:<digest>` |

Evidence: with the real daemon the full profile passes 13/13 checks. Removing `--read-only`, `--cap-drop ALL`, `--security-opt no-new-privileges`, `--pids-limit` or `--user` each makes the probe report exactly that check (the first version of the probe missed the first two, because a non-root user could not write or hold capabilities anyway; it now reads `CapBnd` and the mount flags). `profile-check.test.js` pins every verdict; `supervisor.test.js` covers the gate (a failing or throwing probe disables custom code and starts no container).

Declarative modules never use the supervisor, so a failing preflight does not affect them.

## Job durability: what is and is not guaranteed (Stage 4)

| Step | State written | If the process dies here | Retry |
|---|---|---|---|
| Receipt | none | The caller sees an error; nothing ran | Safe, same `jobId` |
| Claim | `ACCEPTED` | `INTERRUPTED` on restart; nothing ran | `409` (new `jobId` to run again) |
| Container start | `RUNNING` | `INTERRUPTED`; the container is killed as an orphan | `409` |
| External effects | none in the supervisor | The effect may have happened | `409`; reconcile (below) |
| Finish | `SUCCEEDED`/`FAILED` | If the process dies before this write the job is `INTERRUPTED` although it may have succeeded | `409` |
| Cancellation | `FAILED` + `JOB_CANCELLED` | A result that arrives after a cancellation is discarded | New `jobId` |

The guarantee is **at-most-once execution**, not exactly-once effects. Effects reach Runly only through the gateway: each write is idempotent per user and key, and the security audit entry carries the `jobId` and a correlation id, so an `INTERRUPTED` job is reconciled by looking for audit entries with its `jobId`. There are no external effects outside Runly in this version. Tests (`supervisor.test.js`): crash after the claim, crash after the effect, a torn last ledger line, cancellation while running.

## Hardening options evaluated

Tested on Docker Desktop 29.8 (Windows, WSL2 kernel 5.15, cgroup v2). The daemon reports only `seccomp` and `cgroupns` as security options.

| Option | Result | Status |
|---|---|---|
| Image pinned by digest | Enforced by the preflight and by the orchestrator constant | Done |
| Capabilities, `no-new-privileges`, read-only root, tmpfs `noexec`, PID/memory/fd limits | Verified from inside the container (table above) | Done |
| Default seccomp | Active (`Seccomp: 2`); `unshare -U` and `mount` are denied | Done. A custom profile is not adopted: no measured gain over the default for this profile, and an allowlist for Node is a maintenance risk |
| Network restriction | `--internal` network, one proxy to the gateway | Done (Stage 3) |
| Rootless Docker | **Not testable here** (Docker Desktop) | Linux only. Unverified: needs a Linux host to confirm bind mounts, `--internal` networks and cgroup limits under delegation |
| User namespaces (`userns-remap`) | **Not tested** | Not assumed to remove the supervisor's privilege over the daemon: whoever controls the daemon still controls its containers and bind mounts |
| AppArmor | **Not available** on this host | On Linux hosts `docker-default` applies; not measured |
| gVisor (`runsc`) | **Not installed** (`unknown or invalid runtime name`) | Option for third-party code; not tested |

### What the supervisor's Docker access means

Docker access is root-equivalent on the host. This version does **not** remove that privilege; it narrows who can use it:

- It is a separate process; neither the API nor any module has the socket.
- The only input is a signed, closed job contract: no image, mount, network, command or flag comes from the caller.
- The supervisor sees no database URL or service key.
- If the environment cannot enforce the profile, custom code stays off.

A compromise of the supervisor process itself (not of a module) is a host compromise. Until a rootless or remapped daemon is verified on the target Linux host, run it on a host that carries no other critical workload, or leave the custom-code runtime disabled (the default).
