import test from 'node:test'
import assert from 'node:assert/strict'
import {blankDocument,appendObject,validateDocument} from './document.js'
import {documentAssetIds,LINE_CAPS} from './shape-properties.js'
import {lineCapPath} from './line-caps.js'
import {studioSummary} from '../../api/src/routes/studio/studio-document-data.js'
import {reviewStudioDocument} from '../../api/src/routes/studio/studio-review.js'
const id='00000000-0000-4000-8000-000000000001'
const paint={type:'image',fileAssetId:id,image:{zoom:2,rotation:30}}
test('v5 typed paints preserve legacy fill, geometry, stable IDs and reference projections',()=>{
  const doc=appendObject(blankDocument(),'rectangle',{fill:'#123456',fillPaint:paint,shape:{radius:24,strokeWidth:4,dash:'dotted'}})
  assert.equal(doc.schemaVersion,5);assert.equal(doc.objects[0].fill,'#123456')
  assert.deepEqual(documentAssetIds(doc),[id]);assert.equal(studioSummary(doc).preview.objects[0].fillPaint.fileAssetId,id)
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))),doc)
  assert.equal(validateDocument({...doc,objects:doc.objects.map(o=>({...o,fillPaint:undefined}))}).objects[0].fill,'#123456')
  for(const version of [1,2,3,4])assert.equal(validateDocument({...blankDocument(),schemaVersion:version}).schemaVersion,5)
  assert.throws(()=>validateDocument({...doc,schemaVersion:4}))
})
test('photo references and shape properties fail closed; stroke-only icons remain geometry',()=>{
  for(const fileAssetId of ['https://example.com/image.png','data:secret','invalid'])assert.throws(()=>appendObject(blankDocument(),'ellipse',{fillPaint:{...paint,fileAssetId}}))
  for(const shape of [{strokeAlign:'inside'},{radius:-1},{strokeWidth:129},{dash:'invented'},{fillEnabled:1}])assert.throws(()=>appendObject(blankDocument(),'rectangle',{shape}))
  assert.throws(()=>appendObject(blankDocument(),'text',{fillPaint:paint}))
  assert.throws(()=>appendObject(blankDocument(),'ellipse',{shape:{radius:2}}))
  assert.throws(()=>appendObject(blankDocument(),'vector',{iconId:'tabler:star',geometry:{width:24,height:24,paths:[{d:'M0 0L24 24',fill:'none',stroke:'color',strokeWidth:2,cap:'round',join:'round'}]},fillPaint:paint}))
})
test('all line cap pairs persist; v4 booleans migrate without losing semantics',()=>{
  for(const startCap of LINE_CAPS)for(const endCap of LINE_CAPS){const doc=appendObject(blankDocument(),'line',{startCap,endCap});assert.equal(doc.objects[0].startCap,startCap);assert.deepEqual(validateDocument(doc),doc)}
  const legacy=appendObject(blankDocument(),'line',{startArrow:true,endArrow:false});delete legacy.objects[0].startCap;delete legacy.objects[0].endCap
  assert.equal(validateDocument({...legacy,schemaVersion:4}).objects[0].startCap,'arrow')
  for(const kind of LINE_CAPS){const path=lineCapPath([[0,0],[0,0],[1,0]],'start',kind,128);if(path)assert.ok(!path.d.includes('NaN'))}
  assert.equal(lineCapPath([[0,0],[0,0]],'end','diamond',2),null)
  assert.throws(()=>appendObject(blankDocument(),'line',{endCap:'invented'}))
})
test('review never invents photo contrast, rounded coverage or disabled fill',()=>{
  for(const extra of [{fillPaint:paint},{shape:{radius:40}},{shape:{fillEnabled:false}}]){
    const doc=appendObject(appendObject(blankDocument(),'rectangle',{x:0,y:0,width:1080,height:1080,...extra}),'text',{x:50,y:50,text:'Prueba'})
    const result=reviewStudioDocument(doc)
    assert.ok(result.findings.some(f=>f.rule==='requires_manual_review'))
    assert.ok(!result.findings.some(f=>f.rule==='low_contrast'))
  }
})
