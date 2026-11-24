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

## Hardening options evaluated

| Option | Status |
|---|---|
| Rootless Docker | Recommended for production; reduces the blast radius of a compromised supervisor. Not available on the Windows Docker Desktop used in testing. |
| User namespaces (`userns-remap`) | Compatible with this profile; enable it in the daemon. |
| Seccomp | Docker's default profile is in use. A custom, tighter profile is future work. |
| AppArmor | Not available on Docker Desktop for Windows. On Linux hosts, Docker's default (`docker-default`) applies. |
| gVisor | Planned as an additional profile for unreviewed third-party code. |
| Image pinning | The runner image is pinned by digest. |
