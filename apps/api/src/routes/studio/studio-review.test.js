import test from 'node:test'
import assert from 'node:assert/strict'
import { appendObject,blankDocument } from '../../../../shared/studio/document.js'
import { reviewStudioDocument,studioBounds,studioContrast } from './studio-review.js'
import { studioAssetIds,studioSummary } from './studio-document-data.js'

const rules = doc => reviewStudioDocument(doc).findings.map(f=>f.rule)
test('solid contrast exact ratios, AA pass/fail, small secondary text is informational',()=>{
  assert.equal(studioContrast('#ffffff','#000000'),21)
  let doc=appendObject(blankDocument(),'text',{fill:'#000000',fontSize:48})
  assert.deepEqual(rules(doc),[])
  doc.objects[0].fill='#aaaaaa';doc.objects[0].fontSize=18
  assert.ok(rules(doc).includes('low_contrast'));assert.ok(rules(doc).includes('small_text'))
  const finding=reviewStudioDocument(doc).findings.find(f=>f.rule==='small_text')
  assert.equal(finding.severity,'info')
  doc.page.width=800;doc.page.height=800
  assert.ok(!rules(doc).includes('small_text'))
})
test('rotation, text scale and multiline bounds are explicit and conservative',()=>{
  const o={x:20,y:20,width:100,height:40,rotation:90,scaleX:2,scaleY:1}
  const b=studioBounds(o);assert.ok(Math.abs(b.left+20)<0.0001);assert.equal(b.bottom,220)
  let doc=appendObject(blankDocument(),'text',{...o,text:'Uno\nDos',fontSize:40})
  assert.ok(rules(doc).includes('text_outside_page'))
  doc.objects[0].x=-1000;assert.ok(rules(doc).includes('outside_canvas'))
})
test('photos, masks, partial solid shapes and transparency never claim exact contrast',()=>{
  const image=appendObject(blankDocument(),'image',{fileAssetId:'00000000-0000-4000-8000-000000000001',width:900,height:900})
  let doc=appendObject(image,'text',{fill:'#aaaaaa'})
  assert.ok(rules(doc).includes('requires_manual_review'));assert.ok(!rules(doc).includes('low_contrast'))
  doc=appendObject(image,'rectangle',{width:900,height:900,fill:'#ffffff'})
  doc=appendObject(doc,'text',{fill:'#000000'});assert.ok(!rules(doc).includes('requires_manual_review'))
  doc.objects.at(-1).opacity=0.5;assert.ok(rules(doc).includes('requires_manual_review'))
  doc.objects.at(-1).hidden=true;assert.ok(rules(doc).includes('hidden_or_locked'));assert.ok(!rules(doc).includes('requires_manual_review'))
})
test('font families, locked/grouped objects and recursive references, bounded preview',()=>{
  let doc=blankDocument()
  for(const fontFamily of ['Lato','Oswald','Pacifico','sans-serif'])doc=appendObject(doc,'text',{fontFamily,groupId:'g',locked:true,text:'a'.repeat(200)})
  assert.ok(rules(doc).includes('font_families'));assert.ok(rules(doc).includes('hidden_or_locked'))
  assert.equal(studioSummary(doc).preview.objects[0].text.length,120)
  const id='00000000-0000-4000-8000-000000000001'
  assert.deepEqual(studioAssetIds({objects:[{id:'g',type:'group',children:[{id:'i',type:'image',fileAssetId:id}]}]}),[id])
})
