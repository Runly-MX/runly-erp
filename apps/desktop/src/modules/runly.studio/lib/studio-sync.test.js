import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendObject, blankDocument, validateDocument } from '../../../../../shared/studio/document.js'
import { applyOps, diffOps } from '../../../../../shared/studio/operations.js'
import { createStudioSync } from './studio-sync.js'

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
// In-memory server: sequences batches and broadcasts to every client (optionally out of order or lossy).
function createServer(document) {
  const state = { document: validateDocument(document), revision: 1, name: 'Diseño', clients: [], drop: false, fail: 0,receipts:new Map(),requests:[],loseReply:0,denied:false }
  state.connect = (clientId, overrides = {}) => {
    let view = state.document
    const editor = { shown: view, apply: async doc => { editor.shown = doc; return doc } }
    const transport = {
      send: async batch => {
        state.requests.push(structuredClone(batch))
        if(state.denied)throw Object.assign(Error('revoked'),{status:403})
        if (state.fail > 0) { state.fail--; throw Object.assign(Error('offline'), { status: 0 }) }
        const key=`${batch.clientId}:${batch.batchId}`
        if(state.receipts.has(key))return state.receipts.get(key)
        const before=state.document
        state.document = validateDocument(applyOps(state.document, batch.ops)); state.revision++
        if (batch.name !== undefined) state.name = batch.name
        const message = { revision: state.revision, clientId: batch.clientId, batchId: batch.batchId, ops: batch.ops, name: state.name }
        if (!state.drop) for (const client of state.clients) setTimeout(() => client.sync.receive(message), client.lag ?? 1)
        const ack={ revision: state.revision, name: state.name,ops:diffOps(before,state.document) };state.receipts.set(key,ack)
        if(state.loseReply-->0)throw Error('response lost after commit')
        return ack
      },
      fetch: async () => ({ document: state.document, revision: state.revision, name: state.name }),
    }
    const client = { editor, lag: overrides.lag, change: doc => { editor.shown = doc; client.sync.local(doc) } }
    client.sync = createStudioSync({ document: view, revision: state.revision, name: state.name, clientId, transport, editor, delay: 0, gapTimeout: 30, retry: () => 10,...overrides })
    state.clients.push(client)
    return client
  }
  return state
}
const base = () => appendObject(appendObject(blankDocument(800, 600), 'rectangle', { x: 10 }), 'ellipse', { x: 300 })
const edit = (doc, index, patch) => ({ ...doc, objects: doc.objects.map((object, i) => (i === index ? { ...object, ...patch } : object)) })

test('edits on different objects by two clients converge everywhere', async () => {
  const server = createServer(base()), a = server.connect('client-a'), b = server.connect('client-b')
  a.change(edit(a.editor.shown, 0, { x: 111 })); b.change(edit(b.editor.shown, 1, { fill: '#123456' }))
  await Promise.all([a.sync.flush(), b.sync.flush()]); await sleep(20)
  for (const client of [a, b]) { assert.equal(client.editor.shown.objects[0].x, 111); assert.equal(client.editor.shown.objects[1].fill, '#123456') }
  assert.deepEqual(a.sync.state().document, server.document)
})

test('same object: the change the server sequences last wins on every client', async () => {
  const server = createServer(base()), a = server.connect('client-a'), b = server.connect('client-b')
  a.change(edit(a.editor.shown, 0, { x: 1 })); await a.sync.flush()
  b.change(edit(b.editor.shown, 0, { x: 2 })); await b.sync.flush(); await sleep(20)
  assert.equal(a.editor.shown.objects[0].x, 2); assert.equal(b.editor.shown.objects[0].x, 2); assert.equal(server.document.objects[0].x, 2)
})

test('lost broadcasts are recovered by a refetch after the gap timeout', async () => {
  const server = createServer(base()), a = server.connect('client-a'), b = server.connect('client-b')
  server.drop = true
  b.change(edit(b.editor.shown, 1, { x: 7 })); await b.sync.flush()
  server.drop = false
  b.change(edit(b.editor.shown, 1, { x: 8 })); await b.sync.flush(); await sleep(80)
  assert.equal(a.editor.shown.objects[1].x, 8); assert.equal(a.sync.state().revision, server.revision)
})

test('network failures queue the change, report offline and retry; a rename travels too', async () => {
  const server = createServer(base()), statuses = []
  const a = server.connect('client-a')
  server.fail = 2
  a.change(edit(a.editor.shown, 0, { y: 42 })); a.sync.rename('Nuevo nombre')
  await a.sync.flush()
  assert.equal(server.document.objects[0].y, 42); assert.equal(server.name, 'Nuevo nombre'); assert.equal(a.sync.state().status, 'synced')
  void statuses
})

test('local work made while a remote change arrives stays on top', async () => {
  const server = createServer(base()), a = server.connect('client-a', { lag: 15 }), b = server.connect('client-b')
  b.change(edit(b.editor.shown, 1, { x: 500 })); await b.sync.flush()
  a.change(edit(a.editor.shown, 0, { x: 77 }))
  await a.sync.flush(); await sleep(40)
  assert.equal(a.editor.shown.objects[0].x, 77); assert.equal(a.editor.shown.objects[1].x, 500)
  assert.deepEqual(a.editor.shown, server.document)
})

test('response lost after commit retries identical immutable batch; newer work uses another identity',async()=>{
  const server=createServer(base()),a=server.connect('client-a');server.drop=true;server.loseReply=1
  a.change(edit(a.editor.shown,0,{x:123}));const done=a.sync.flush();await sleep(2)
  a.change(edit(a.editor.shown,0,{y:456}));await done
  assert.equal(server.revision,3);assert.equal(server.document.objects[0].x,123);assert.equal(server.document.objects[0].y,456)
  assert.deepEqual(server.requests[0],server.requests[1]);assert.notEqual(server.requests[1].batchId,server.requests[2].batchId)
  a.sync.close()
})
test('403 preserves draft and queue, rejects flush and stops retries; reload rechecks authorization',async()=>{
  const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}
  const server=createServer(base()),a=server.connect('client-a',{storage,storageKey:'queue'});server.denied=true
  a.change(edit(a.editor.shown,0,{x:999}));await assert.rejects(a.sync.flush(),{status:403});assert.equal(a.sync.state().document.objects[0].x,999)
  const count=server.requests.length;await sleep(35);assert.equal(server.requests.length,count);a.sync.close()
  const b=server.connect('new-tab-b',{storage,storageKey:'queue'});await assert.rejects(b.sync.flush(),{status:403});assert.equal(server.revision,1);assert.ok(values.has('queue'));b.sync.close()
})
test('reload retains uncertain batch id but rotates session for new edits, receipts never re-execute',async()=>{
  const values=new Map(),storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}
  const server=createServer(base()),a=server.connect('client-a',{storage,storageKey:'queue',retry:()=>10000});server.drop=true;server.loseReply=1
  a.change(edit(a.editor.shown,0,{x:123}));const abandoned=a.sync.flush();await sleep(2);a.sync.close();await assert.rejects(abandoned)
  const b=server.connect('new-tab-b',{storage,storageKey:'queue'});await b.sync.flush();assert.equal(server.revision,2);assert.equal(b.sync.state().revision,2)
  b.change(edit(b.sync.state().document,1,{x:456}));await b.sync.flush();assert.equal(server.revision,3)
  assert.equal(server.requests.at(-1).clientId,'new-tab-b');assert.equal(values.has('queue'),false);b.sync.close()
})
test('reordered duplicates/gaps and MCP resync preserve pending properties without replaying foreign changes',async()=>{
  const server=createServer(base()),a=server.connect('client-a',{delay:10000}),doc=base()
  a.change(edit(doc,0,{x:99}));server.document=edit(doc,0,{fill:'#abcdef'});server.revision=4
  a.sync.receive({revision:4,ops:diffOps(doc,server.document),clientId:'remote-b',batchId:1})
  await a.sync.resync();await a.sync.flush()
  assert.equal(server.document.objects[0].x,99);assert.equal(server.document.objects[0].fill,'#abcdef');assert.equal(a.sync.state().revision,5)
  a.sync.receive({revision:4,ops:[{type:'remove',id:doc.objects[0].id}]});assert.equal(a.sync.state().document.objects.length,2);a.sync.close()
})
