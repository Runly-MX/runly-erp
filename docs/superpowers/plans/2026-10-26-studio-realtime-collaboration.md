# Plan — runly.studio real-time collaboration

Spec: `docs/superpowers/specs/2026-10-26-studio-realtime-collaboration-design.md`
Status: approved (user decision 2026-10-26). Owner: Claude (engine, API, UI).

1. **Shared operations** — `apps/shared/studio/operations.js` with `diffOps`,
   `applyOps`, `compactOps`, `orderSlots`; `operations.test.js` (round trip
   diff→apply, concurrent apply order, idempotence, compaction).
2. **Server** — `applyChanges` in `studio-service.js` (lock, access, apply,
   validate, assets, revision+1, throttled audit, name), route
   `POST /studio/designs/:id/changes`, `change` broadcast (with refetch fallback),
   SDK `studio.applyChanges`. Route/service test with fakes.
3. **Engine** — selective history in `document-history.js` (+ tests);
   `applyRemote`/`load` and minimal update in `fabric-adapter.js`; history and
   interaction rebasing; `onChange(doc, {remote})`.
4. **Client sync** — `lib/studio-sync.js` (+ tests with fake transport and
   timers): outbox, in-flight batch, ordered remote apply, buffer + resync,
   retry/backoff, flush, status.
5. **Integration** — `useStudioRealtime` forwards `change`/`changed`;
   `useStudioSync` in `DesignEditor` replaces save/conflict/server dialogs;
   top bar status; ensureSaved/templates use `flush`; draft recovery via `load`.
6. **Verification** — lint, unit tests, web build, API boot; Playwright with two
   sessions on the dev servers (test company) covering the spec list; docs
   (`studio-editor-ui-contract.md` realtime section, `studio-visual-tools-ui.md`).
