import test from 'node:test'
import assert from 'node:assert/strict'
import { createDraftStorage,recoverDraftDocument,createDraftArchive,sameDraft } from './draft-storage.js'
import { blankDocument,appendObject } from '../../../../../shared/studio/document.js'

test('drafts are scoped, canonical and remain recoverable after long absences', () => {
  const values = new Map(), storage = { getItem: key => values.get(key), setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) }
  let now = 1000
  const draft = createDraftStorage(storage, 'company:owner:design', () => now)
  const document = { ...blankDocument(), signedUrl: 'never persisted' }
  assert.equal(draft.write({ name: 'Local', revision: 2, document }), true)
  assert.equal(draft.read().document.signedUrl, undefined)
  assert.equal(createDraftStorage(storage, 'other-company:owner:design').read(), null)
  assert.equal(createDraftStorage(storage, 'company:other-owner:design').read(), null)
  now += 8 * 24 * 60 * 60_000
  assert.equal(draft.read().name, 'Local')
  draft.clear(); assert.equal(values.size, 0)
})

test('unreviewed recovery survives clearing/new autosaves and retires only the chosen copy',()=>{
  const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}
  const slot=createDraftStorage(storage,'tenant:actor:design'),archive=createDraftArchive(storage,'tenant:actor:design')
  const old={name:'Legacy pending',revision:1,document:blankDocument()},remote={...old,name:'Concurrent pending',revision:2}
  slot.write(old);assert.ok(archive.stash(slot.read()));slot.clear();slot.write(remote)
  assert.equal(archive.read().name,old.name);assert.ok(archive.stash(remote));assert.ok(archive.stash({...old,savedAt:123}))
  assert.ok(archive.remove(old));assert.ok(sameDraft(archive.read(),remote));assert.ok(archive.remove(remote));assert.equal(archive.read(),null)
  assert.equal(slot.read().name,remote.name)
})
test('archive quota and malformed data preserve existing bytes and signal failure',()=>{
  let bytes='[{"document":{"schemaVersion":99}}]'
  const storage={getItem:()=>bytes,setItem:()=>{throw Error('quota')},removeItem:()=>{throw Error('quota')}}
  const archive=createDraftArchive(storage,'scope'),before=bytes
  assert.equal(archive.stash({name:'Local',revision:1,document:blankDocument()}),false);assert.equal(bytes,before)
  bytes='[]';assert.equal(archive.stash({name:'Local',revision:1,document:blankDocument()}),false)
})

test('storage quota/invalid data do not break editing or restore unvalidated JSON', () => {
  const store = createDraftStorage({ getItem: () => '{', setItem: () => { throw Error('quota') } }, 'scope')
  assert.equal(store.read(), null)
  assert.equal(store.write({ document: blankDocument() }), false)
})
test('recovering a deleted-object conflict fails without discarding the saved scene; safe recovery preserves remote additions',()=>{
  const values=new Map(),store=createDraftStorage({getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},'scoped')
  const document=appendObject(blankDocument(),'rectangle',{id:'mine'}),draft={document,name:'Local',revision:2,operations:[{type:'patch',id:'mine',set:{x:123}}]}
  store.write(draft);assert.throws(()=>recoverDraftDocument(blankDocument(),store.read()),/eliminados/);assert.equal(store.read().document.objects[0].id,'mine')
  const remote=appendObject(document,'ellipse',{id:'remote-added'}),recovered=recoverDraftDocument(remote,store.read())
  assert.equal(recovered.objects[0].x,123);assert.equal(recovered.objects[1].id,'remote-added')
  assert.deepEqual(recoverDraftDocument(blankDocument(),{...draft,operations:[{type:'upsert',object:document.objects[0]},...draft.operations]}).objects[0].x,123)
})
