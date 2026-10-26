import { test } from 'node:test'
import assert from 'node:assert/strict'
import { appendObject,blankDocument,validateDocument } from './document.js'
import { STUDIO_TEMPLATES,searchTemplates,templateDocument } from './templates.js'
import { STUDIO_FONTS } from './fonts.js'
import { creditsText,iconSource } from './licenses.js'

test('v1/v2 scenes upgrade without changing text scale or trusting unsupported font names',()=>{
  const base=appendObject(blankDocument(),'text',{scaleX:1.4,scaleY:0.8})
  for(const version of [1,2]) {
    const doc=validateDocument({...base,schemaVersion:version,objects:base.objects.map(o=>({...o,fontFamily:'untrusted-font'}))})
    assert.equal(doc.schemaVersion,3);assert.equal(doc.objects[0].fontFamily,'sans-serif');assert.equal(doc.objects[0].scaleX,1.4);assert.equal(doc.objects[0].scaleY,0.8)
  }
  for(const font of STUDIO_FONTS)assert.equal(appendObject(blankDocument(),'text',{fontFamily:font.family}).objects[0].fontFamily,font.family)
  assert.throws(()=>appendObject(blankDocument(),'text',{fontFamily:'url(https://example.com/font)'}))
  assert.throws(()=>appendObject(blankDocument(),'text',{fontVariant:'italic'}))
})
test('vector geometry persists independently and strips arbitrary attributes and SVG',()=>{
  const geometry={width:24,height:24,paths:[{d:'M0 0L24 24',fill:'none',stroke:'color',strokeWidth:2,cap:'round',join:'round',onload:'bad'}]}
  const document=appendObject(blankDocument(),'vector',{iconId:'tabler:star',geometry,svg:'<script/>'})
  assert.equal(document.objects[0].svg,undefined);assert.equal(document.objects[0].geometry.paths[0].onload,undefined)
  for(const d of ['M0 0L','M0 0A1 1 0 4 0 2 2','M0 0L1e99 2','<script/>','M0 0 url(x)'])assert.throws(()=>appendObject(blankDocument(),'vector',{iconId:'tabler:star',geometry:{...geometry,paths:[{...geometry.paths[0],d}]}}))
  assert.throws(()=>validateDocument({...document,schemaVersion:2}))
  assert.throws(()=>appendObject(blankDocument(),'vector',{iconId:'unapproved:icon',geometry}))
  assert.ok(creditsText([iconSource('tabler:star'),iconSource('tabler:star')]).includes('MIT'))
})
test('original template catalog pages, filters and returns independent versioned editable scenes',()=>{
  assert.ok(STUDIO_TEMPLATES.length>=16)
  assert.equal(new Set(STUDIO_TEMPLATES.map(t=>JSON.stringify(templateDocument(t.key)))).size,STUDIO_TEMPLATES.length)
  const first=searchTemplates(),second=searchTemplates({page:2})
  assert.equal(first.data.length,12);assert.equal(second.data.length,Math.min(12,STUDIO_TEMPLATES.length-12))
  assert.equal(searchTemplates({q:'Mesa del día'}).data[0].category,'Menús')
  assert.ok(searchTemplates({q:'pagina abierta'}).data.some(row=>row.key==='reading'))
  assert.ok(searchTemplates({category:'Invitaciones'}).data.length>=1)
  const a=templateDocument('quiet');a.objects[0].fill='#000000'
  assert.notDeepEqual(a,templateDocument('quiet'))
  assert.ok(first.data.every(t=>t.version===1&&t.creator==='Runly'&&t.document.objects.every(o=>o.type!=='image')))
})
