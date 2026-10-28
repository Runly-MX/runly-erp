# Notifications Realtime 3.0: optimization design

Scope: `runly.notifications` read path, Realtime delivery, frontend bell and
delivery worker. Local only, disposable Supabase, no deploy. Every claim of
improvement must come from this module's own before/after measurements.

## Verified starting state (HEAD at start, audited by reading code)

| Area | Finding | Cost |
|---|---|---|
| Bell | Two `useQuery` (`panel`, `bell-unread`), both `refetchInterval 30s` + focus refetch | 2 HTTP / 30 s / tab, hidden or not |
| API `list` | Each call runs `findMany` + 3 `count` (all, messages, general) + `resolveCompanyContext` + actors lookup | about 5 to 6 SQL per call, so 10 to 12 SQL / 30 s idle per tab; `bell-unread` asks `limit 1` but still pays 3 counts |
| Realtime | `notification.new` broadcast AND a separate `postgres_changes` INSERT channel per user; both call `invalidate(['notifications'])` | duplicate refetch per event, extra Realtime RLS work per insert |
| Invalidation | Prefix `['notifications']` refetches panel (per tab) and unread together, plus SW path invalidates `notifications-inbox` | up to 3 refetches per event |
| Dedupe | Broadcast payload has no `notificationId`; key is `dedupeKey` or `eventType+title+body` within 6 s | two legitimate alerts with equal text collapse; no stable identity across Broadcast, Web Push and FCM |
| Publish | Per-recipient sequential queries inside one transaction (dedupe, preference, DND, create, deliveries) | N+1 for fan-out, long transaction |
| Broadcaster | `_send` opens a transaction, takes `FOR SHARE` on the authorization revision, re-authorizes, then awaits the Realtime HTTP call inside it | transaction held for the length of an external HTTP request |

## Principles

1. PostgreSQL via the API is the source of truth. Broadcast is a hint that
   something changed, never the state of read/unread.
2. Recovery is always HTTP: initial load, reconnect, visibility change and a
   slow heartbeat. A lost broadcast must be repaired by the next reconcile.
3. Do not remove a redundant mechanism until its guarantee is replaced and
   measured. `postgres_changes` is evaluated, not assumed removable.
4. Security contracts do not move: private per-user topic, revision-suffixed
   topic, `canReceiveResourceEvent`, RLS on `notification` and
   `realtime.messages` are unchanged.

## Design

### B. Read path

- New `GET /notifications/summary` returning
  `{ unreadCount, unreadByCategory:{messages,general}, latestId }` computed by
  one grouped SQL (`count(*) FILTER`) over the same visibility predicate as
  `list` (company scope plus in-app delivery rule). `latestId` is the highest
  notification id visible to the user (UUIDv7 is time ordered), used by the
  client to detect missed events without a list fetch.
- `list` keeps its response contract. The three counts collapse into the same
  single grouped query, and a `counts=0` query flag lets callers that already
  have the summary skip them. Default behaviour is unchanged for old clients.
- Predicate parity is enforced by a test that compares summary counts with
  `list` counts on seeded data (messages, general, other company, global,
  read, no in-app delivery).

### C. Realtime

- The broadcast payload gains `notificationId` (all created or updated ids for
  that recipient) and `unreadDelta` is NOT sent (no client arithmetic as truth).
  No private resource content is added.
- Broadcast stays the primary signal. After measurement, `postgres_changes`
  is removed only if its marginal value is covered by reconnect/visibility/
  heartbeat reconciliation. The decision and numbers go in the validation
  report, with the alternative kept if loss tests fail.
- Broadcaster lock: the `FOR SHARE` held across the HTTP call is the
  ordering/revocation fence. It is measured, not changed, unless the
  measurements show it matters and the fence can be preserved.

### D. Frontend

- Bell: `summary` query always on, no 30 s timer. List query enabled only when
  the dropdown is open or the inbox screen is mounted.
- Event handling: a burst-coalesced (about 1.2 s) refresh of `summary`; list is
  refetched only if currently active. Invalidation is by exact key, not by
  the broad prefix.
- Reconcile triggers: channel (re)SUBSCRIBED, `visibilitychange` to visible,
  `online`, and a 120 s heartbeat while visible. Hidden tabs do no polling.
- Dedupe identity: `n:<notificationId>` first, then `dk:<dedupeKey>`, then the
  content hash only as the last fallback. Web Push and FCM data carry the same
  `notificationId`. Visual dedupe stays separate from persistence idempotency
  (`dedupeKey` in the API) and delivery idempotency (unique delivery row).

### E. Worker

Audit first (claim, backoff, `sending` recovery, transaction scope). Change only
what a measurement or a defect justifies. No provider call inside a DB
transaction. Preferences, DND and delivery rules are not touched.

## Out of scope

Changing producers, preferences, DND semantics, digest content, new counter
tables (only if the grouped query is shown insufficient), and any
infrastructure outside this repository.

## Measurement

`scripts/measure-notifications.mjs` on the disposable stack with the real built
web app: scenarios A to F, H, J and N for 1, 5 and 10 users, plus synthetic
burst and worker scenarios. Metrics: API HTTP count by route, SQL calls from
`pg_stat_statements`, WebSocket frames, CPU of API/DB/Realtime, visible latency
and duplicate or missing toasts. Scenarios that cannot be exercised in a
headless browser (suspended mobile PWA, real push providers) are covered by
contract tests and listed as not measured.
