# runly.studio — real-time collaboration (operations, not saves)

Status: approved (user decision 2026-10-26: Claude owns engine + API + UI for
this change; Codex pauses Studio engine/routes meanwhile)

## Problem

Studio persists whole documents with optimistic revisions (`PUT
/studio/designs/:id` with `revision`). Every change needs "Guardar"; two people
in the same design collide (409), and the editor offers "Guardar como copia".
Presence and cursors exist, but content does not flow live. The undo history
stores full snapshots, so undo would also revert a collaborator's work.

## Goals

- Real-time co-editing: every committed change reaches the other open editors
  in well under a second, without a save button and without revision conflicts.
- Concurrent edits on different objects all survive; on the same object the
  last change the server receives wins (per object).
- Undo/redo only reverts **my** changes, applied on top of the current shared
  state.
- Offline/flaky network: local changes stay visible, are queued, retried, and
  sent on reconnection; a local draft still protects against closing the tab.
- Read-only collaborators see changes live and never send.
- MCP, templates and the existing whole-document API keep working.

## Non-goals

- No CRDT library, no character-level merge inside one text (last writer wins
  per object; text edits are object updates).
- No continuous broadcast of positions *during* a Fabric drag (the result is
  sent at drop; sliders and inline text already stream intermediate states).
- No schema or migration changes: the document JSON and `studio_design.revision`
  stay as they are.

## Design

### Operations (shared, `apps/shared/studio/operations.js`)

```
{type:'upsert', object}          // canonical object; new ids append to the end
{type:'remove', id}
{type:'order', ids:[...]}        // stacking of the listed ids (others keep their slots)
{type:'page', page}              // width/height/background/backgroundPaint
```

- `diffOps(a, b)` → ops turning document `a` into `b` (page, removes, upserts,
  then order only if the relative order of shared ids changed).
- `applyOps(doc, ops)` is total and deterministic: unknown removes are ignored,
  upserts replace by id or append, `order` fills the slots currently held by the
  listed ids in the listed order. Same function on server and clients.
- `compactOps(ops)` keeps the last op per id, the last order and page.

### Server

`POST /studio/designs/:id/changes` (`studio.edit`, editor access):
`{clientId, batchId, ops, name?}` → `{revision}`. One transaction: row lock,
access, `applyOps(stored, ops)`, `validateDocument`, asset authorization and
binding exactly as `update`, `revision = revision + 1` (no revision check), and
the name column when given. Audit at most once per actor and design every 10
minutes. After commit it broadcasts `change` on `studio:design:{id}` with
`{revision, clientId, batchId, ops, name}`; payloads over 200 KB broadcast
`{revision, refetch: true}`. `PUT` keeps broadcasting `changed {revision}`
(clients refetch). Limits: ≤ 500 ops per batch, body ≤ 1.1 MB (existing).

### Client sync (`lib/studio-sync.js`, pure, injectable transport)

Server reconciliation: keep `server` (document at `revision`), `pending`
batches (sent, not yet sequenced) and an outbox. The editor shows
`apply(pending + outbox, server)`. Local document changes are diffed into the
outbox and flushed (one batch in flight, ~80 ms batching). Remote `change`
messages are applied in revision order (buffer out-of-order; after 1.5 s or on
`refetch`/`changed`, refetch the document and reapply pending). Own messages
retire their batch. Network errors keep the batch and retry with backoff;
validation/permission errors drop it, resync and report. `flush()` resolves
when everything local is sequenced (used before photo editing, templates,
export of the latest state).

### Engine (`fabric-adapter.js`)

- `applyRemote(document)`: minimal update of the canvas (in-place property
  updates, rebuild only when the object kind/photo/font/geometry changes, add,
  remove, reorder, page), keeps selection by id, skips objects under an active
  local transform or text editing, never records history, rebases the history
  and an open interaction by the remote delta, emits
  `onChange(document, {remote: true})`.
- `load(document)`: same minimal update but as a local change (draft recovery).
- Selective history (`document-history.js`): entries are `{forward, inverse}`
  op lists; undo applies the inverse to the current document (through the same
  minimal update) and the result flows to sync as a normal local change.

### UI

- Top bar: no Guardar button; status «Sincronizado», «Sincronizando…»,
  «Sin conexión · se enviará al reconectar», «Error al sincronizar · Reintentar».
- No 409 dialogs, no "Guardar como copia" on conflict, no "Hay una revisión
  nueva". Draft recovery offers to reapply unsynced local changes.
- Name edits sync like any change.

## Permissions and security

Same as `PUT`: company membership, `studio.edit`, design editor access, asset
authorization re-checked per batch inside the transaction. The broadcast uses
the existing authorized private channel. The client never chooses revisions.

## Verification

Unit: operations (diff/apply/compact/order), selective history, sync
reconciliation with a fake transport (out of order, own echo, resync, retry).
API: route test for apply + broadcast. E2E (two browser sessions, test
company): live propagation, concurrent edits on different objects, same-object
last-writer-wins, undo reverting only own change, offline queue, reload
persistence, viewer receives but cannot send.
