# Growth site monitors, phase 3 (domain, TCP, DNS, maintenance) - design

Date: 2026-11-14
Status: draft, continues phases 1 and 2 (`2026-11-14-growth-site-monitors-phase{1,2}-design.md`).

## Problem

Sites also fail because the domain registration lapses, DNS records change or break, or a
non-HTTP service (mail, database proxy, SSH) stops accepting connections. Planned work
(deploys, migrations) triggers false alarms because there is no way to silence a monitor.
Some error messages are raw English network errors.

## Goals

- `domain` check: registration expiry through RDAP, with warnings.
- `tcp` check: host and port accept connections.
- `dns` check: a record type resolves and optionally contains an expected value.
- Maintenance windows per monitor: no checks recorded, no incidents, no alerts until a set time.
- Clearer Spanish errors for common network failures; allow clearing a stored JSON assertion.

## Non-goals

Registrar-specific WHOIS parsing for TLDs without RDAP, DNSSEC validation, recurring
(scheduled) maintenance windows, alert escalation policies.

## Design

### Checks (`growth-monitor-probes.js`)

- `domain`: `config.host` reduced to its registrable domain (last two labels, or three when
  the second-level label is a known generic like `com`/`net`/`org`/`gob`/`edu`/`co` under a
  two-letter TLD). Fetches `https://rdap.org/domain/<domain>` (fixed host, not user
  controlled; redirects to the registry are followed, timeout 8 s, response cap 256 KB) and
  reads the `expiration` event. States: `up` when more than `warnDays` (default 30) remain,
  `degraded` inside the window, `down` when expired. If the registry gives no RDAP data or
  no expiration date, the result is `ok` with state `unknown` and a message; it never raises
  a false outage. Default interval 24 h.
- `tcp`: connects to `host:port` through the same resolve-then-pin SSRF guard (public
  addresses only), timeout 5 s, reports latency. Port allowed 1-65535.
- `dns`: `dns.promises.resolve` for `A`, `AAAA`, `CNAME`, `MX` or `TXT`. Down when it fails
  or returns no records, or when `expected` (case-insensitive substring of any record) is
  absent. Not an SSRF vector (DNS query only).

### Alerts

Expiry thresholds become per type: `ssl` 30/14/7/3/1 days, `domain` 60/30/14/7 days, with
event `growth.monitor.domain_expiring`. Down/recovery and the 60-minute reminder behave as
in phase 1.

### Maintenance

`config.maintenanceUntil` (ISO). While it is in the future the worker skips the monitor
entirely: no check row, no state change, no notification; an incident already open stays
open and resolves on the first good check after the window. Set or cleared by
`POST /growth/monitors/:id/maintenance { minutes }` (1-1440) or `{ minutes: null }`; it does
not reset monitor state. The list shows a "En mantenimiento" badge.

### Small fixes

- Network errors mapped to Spanish: `ENOTFOUND` (el dominio no existe o no resuelve),
  `ECONNREFUSED` (conexion rechazada), `ECONNRESET`, `ETIMEDOUT`.
- `PATCH` config accepts `null` for `assert` and `mustContain`/`mustNotContain` to clear them.
- Interval validator allows up to 86400 s (needed for domain checks).

### UI

New types in the monitor form (domain, tcp, dns) with their fields; interval options add
"Cada 6 horas" and "Cada dia"; a "Mantenimiento" action opens a small dialog
(1 h, 4 h, 24 h, cancel); Detectar y crear adds a `domain` suggestion.

## Testing

Unit: registrable-domain reduction, RDAP parsing (expiry, no data, expired), tcp and dns
evaluators, maintenance skipping in the worker, per-type thresholds, error mapping. E2E on
the test company: tcp against a local server (allow-private flag), dns for a real domain,
domain against a real public domain, maintenance suppressing an outage.

## Migration

None: new types and `maintenanceUntil` live in `config`.
