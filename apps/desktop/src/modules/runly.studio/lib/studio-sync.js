import { validateDocument } from '../../../../../shared/studio/document.js'
import { applyOps, compactOps, diffOps } from '../../../../../shared/studio/operations.js'

// Real-time document sync by server reconciliation. The server sequences
// operation batches (revision + 1 each) and broadcasts them; this client keeps
//   server  — the document at `revision` (everything sequenced so far)
//   pending — batches sent and not yet seen in the sequence (oldest first)
//   outbox  — local operations not sent yet
// and shows apply(pending + outbox) on top of server. Out-of-order messages are
// buffered; a gap, a `refetch` message or a whole-document update triggers a
// refetch, after which pending work is replayed (operations are idempotent).
//
// transport: { send({clientId,batchId,ops,name}) → {revision}, fetch() → {document,revision,name} }
// editor:    { apply(document) → Promise<document as rendered> }
export function createStudioSync({ document, revision, name, clientId, transport, editor, onStatus, onName, onError,
  delay = 80, gapTimeout = 1500, retry = attempt => Math.min(8000, 500 * 2 ** attempt), timers = globalThis }) {
  let server = validateDocument(document), local = server, sequence = revision, title = name
  let pending = [], outbox = [], outboxName, inflight = null, nextBatch = 1, flushTimer = null, gapTimer = null, retryTimer = null, attempts = 0, closed = false
  const buffered = new Map(), idle = []
  let status = 'synced'
  const setStatus = value => { if (status !== value) { status = value; onStatus?.(value) } }
  const settle = () => {
    if (!inflight && !pending.length && !outbox.length && outboxName === undefined) {
      if (status !== 'error') setStatus('synced')
      idle.splice(0).forEach(resolve => resolve())
    }
  }
  const unsent = () => [...pending.flatMap(batch => batch.ops), ...outbox]

  // What this editor should show: the server state plus local work.
  async function reconcile() {
    const target = validateDocument(applyOps(server, unsent()))
    if (JSON.stringify(target) === JSON.stringify(local)) return
    local = target
    // The editor may keep objects under a local gesture; its result is our truth.
    const rendered = await editor.apply(target)
    if (rendered) local = validateDocument(rendered)
  }

  function schedule(wait = delay) { if (!flushTimer && !closed) flushTimer = timers.setTimeout(() => { flushTimer = null; flush() }, wait) }
  async function flush() {
    if (closed || inflight || (!outbox.length && outboxName === undefined)) return
    const batch = { id: nextBatch++, ops: compactOps(outbox), name: outboxName }
    outbox = []; outboxName = undefined
    pending.push(batch); inflight = batch; setStatus('syncing')
    try {
      const ack = await transport.send({ clientId, batchId: batch.id, ops: batch.ops, ...(batch.name !== undefined ? { name: batch.name } : {}) })
      attempts = 0; inflight = null
      receive({ revision: ack.revision, clientId, batchId: batch.id, ops: batch.ops, name: ack.name })
    } catch (error) {
      inflight = null
      if (error?.status >= 400 && error.status < 500) {
        // Rejected (validation or permission): drop it and show the server truth.
        pending = pending.filter(item => item !== batch)
        setStatus('error'); onError?.(error.message ?? 'No se pudo guardar el cambio.', error)
        await resync()
      } else {
        // Network or server error: keep the batch at the head and retry.
        pending = pending.filter(item => item !== batch); outbox = [...batch.ops, ...outbox]
        if (batch.name !== undefined && outboxName === undefined) outboxName = batch.name
        nextBatch--; setStatus('offline')
        retryTimer = timers.setTimeout(() => { retryTimer = null; flush() }, retry(attempts++))
        return
      }
    }
    if (outbox.length || outboxName !== undefined) schedule(0)
    settle()
  }

  // One sequenced batch (own ack/echo or a collaborator's broadcast).
  function receive(message) {
    if (closed || !Number.isSafeInteger(message?.revision) || message.revision <= sequence) return
    buffered.set(message.revision, message)
    drain()
  }
  function drain() {
    let applied = false
    while (buffered.has(sequence + 1)) {
      const message = buffered.get(sequence + 1)
      buffered.delete(sequence + 1)
      if (message.refetch) { buffered.clear(); resync(); return }
      server = validateDocument(applyOps(server, message.ops ?? []))
      sequence = message.revision
      if (message.name !== undefined && message.name !== title) { title = message.name; onName?.(title) }
      if (message.clientId === clientId) pending = pending.filter(batch => batch.id !== message.batchId)
      applied = true
    }
    timers.clearTimeout(gapTimer); gapTimer = null
    if (buffered.size) gapTimer = timers.setTimeout(() => { gapTimer = null; resync() }, gapTimeout)
    if (applied) reconcile().catch(error => onError?.(error.message, error)).finally(settle)
  }
  let resyncing = null
  function resync() {
    resyncing ??= (async () => {
      try {
        const latest = await transport.fetch()
        if (latest.revision >= sequence) {
          server = validateDocument(latest.document); sequence = latest.revision
          for (const revision of [...buffered.keys()]) if (revision <= sequence) buffered.delete(revision)
          if (latest.name !== undefined && latest.name !== title) { title = latest.name; onName?.(title) }
        }
        // Pending batches may already be inside the fetched document; replaying is harmless.
        await reconcile()
        if (status === 'error' || status === 'offline') setStatus(pending.length || outbox.length ? 'syncing' : 'synced')
      } catch (error) { setStatus('offline'); onError?.(error.message, error) }
      finally { resyncing = null; drain(); settle() }
    })()
    return resyncing
  }

  return {
    // The editor changed locally (onChange without {remote}).
    local(document) {
      if (closed) return
      const next = validateDocument(document), ops = diffOps(local, next)
      local = next
      if (!ops.length) return
      outbox.push(...ops); setStatus(status === 'offline' ? 'offline' : 'syncing'); schedule()
    },
    rename(value) { if (closed || value === title) return; title = value; outboxName = value; setStatus('syncing'); schedule() },
    receive,
    // A whole-document update happened elsewhere (MCP, older client): refetch.
    changed(revision) { if (!Number.isSafeInteger(revision) || revision > sequence) resync() },
    resync,
    // Resolves when every local change is sequenced by the server.
    flush() {
      timers.clearTimeout(flushTimer); flushTimer = null; flush()
      return inflight || pending.length || outbox.length || outboxName !== undefined ? new Promise(resolve => idle.push(resolve)) : Promise.resolve()
    },
    state: () => ({ status, revision: sequence, pending: pending.length + (outbox.length ? 1 : 0), document: local, name: title }),
    close() { closed = true; [flushTimer, gapTimer, retryTimer].forEach(timer => timers.clearTimeout(timer)); idle.splice(0).forEach(resolve => resolve()) },
  }
}
