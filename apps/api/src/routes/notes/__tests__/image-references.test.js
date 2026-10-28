import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as Y from 'yjs'
import { parseNoteImageReference, collectNoteImageReferences } from '../image-references.js'
const url='https://storage.example.test/storage/v1/object/public/runly-notes/companies/company/notes/note/image.png'
test('Recognizes current/legacy originals, transforms and expiring references without granting access',()=>{
  for(const kind of ['object/public','object/sign','object/authenticated','render/image/public','render/image/sign']) {
    assert.deepEqual(parseNoteImageReference(url.replace('object/public',kind)+'?token=example'),{bucket:'runly-notes',key:'companies/company/notes/note/image.png'})
  }
  assert.equal(parseNoteImageReference(url.replace('runly-notes','atlas-notes')).bucket,'atlas-notes')
  assert.equal(parseNoteImageReference(url.replace('runly-notes','runly-files')),null)
  assert.equal(parseNoteImageReference(url.replace('image.png','%2e%2e%2fsecret')),null)
  assert.equal(parseNoteImageReference(url.replace('image.png','image%00.png')),null)
})
test('Inventories visible CRDT attributes, HTML, cover and files without rewriting the document',()=>{
  const doc=new Y.Doc(),image=new Y.XmlElement('image');image.setAttribute('src',url)
  doc.getXmlFragment('default').insert(0,[image]);const state=Buffer.from(Y.encodeStateAsUpdate(doc))
  const before=Buffer.from(state)
  const refs=collectNoteImageReferences({state,content:`<img src='${url}'>`,cover_url:url,files:{f:{url:url.replace('image.png','canvas.png')}}})
  assert.equal(refs.length,2);assert.deepEqual(state,before)
  doc.getXmlFragment('default').delete(0,1)
  assert.deepEqual(collectNoteImageReferences({state:Buffer.from(Y.encodeStateAsUpdate(doc))}),[])
  doc.destroy()
})
