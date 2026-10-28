# Notifications Realtime 3.0 plan

Spec: `docs/superpowers/specs/2026-10-27-notifications-realtime-optimization-design.md`.
Each stage is its own commit set and is verified before the next one starts.

## A. Audit and baseline
- [ ] Build the baseline API image from the starting commit (no changes applied).
- [ ] `scripts/measure-notifications.mjs`: disposable stack, N seeded users, real
      browser pages, scenarios A to F, H, J, N; writes `.artifacts/notifications/<label>-*`.
- [ ] Run the baseline (1, 5, 10 users) and record numbers in the report.

## B. Read path
- [ ] `summary` service method plus route plus SDK; single grouped SQL.
- [ ] `list` uses the grouped query; `counts=0` flag.
- [ ] Tests: predicate parity with `list`, company scope, global rows, read rows.

## C. Realtime
- [ ] `notificationId` in the `notification.new` payload and in Web Push/FCM data.
- [ ] Measure `postgres_changes` marginal value; decide remove or keep.
- [ ] Loss test: drop the broadcast, verify the next reconcile repairs the bell.

## D. Frontend
- [ ] Bell split (summary always, list on demand), no timers.
- [ ] Coalesced exact-key refresh, reconcile on reconnect/visible/online/heartbeat.
- [ ] Identity based dedupe; StrictMode and listener cleanup checks.

## E. Delivery worker
- [ ] Audit claim/retry/transaction scope; fix only proven defects with tests.

## F. Certification
- [ ] After-run of the measurement for 1, 5, 10 users, same runner.
- [ ] Security matrix (A/B users, companies, revoked, expired token).
- [ ] Report `docs/deployment/RUNLY_NOTIFICATIONS_REALTIME_LOCAL_VALIDATION.md`.
