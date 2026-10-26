import {test} from 'node:test'
import assert from 'node:assert/strict'
import {blankDocument,appendObject,validateDocument} from './document.js'
import {IMAGE_MASKS,imageProperties} from './image-properties.js'
import {importStudioSvg} from './svg-geometry.js'
import {studioFontStyle} from './fonts.js'
const id='00000000-0000-4000-8000-000000000001'
test('v1/v2/v3 upgrade logically to v4; original assets and regular text semantics survive',()=>{
  for(const schemaVersion of [1,2,3]){
    const input=appendObject(appendObject(blankDocument(),'text'),'image',{fileAssetId:id})
    const doc=validateDocument({...input,schemaVersion})
    assert.equal(doc.schemaVersion,4);assert.equal(doc.objects[0].textAlign,'left');assert.equal(doc.objects[1].fileAssetId,id);assert.equal(doc.objects[1].image,undefined)
  }
})
test('masks, crop, inner transform, adjustments and group identity have a bounded canonical roundtrip',()=>{
  for(const mask of IMAGE_MASKS){
    const doc=appendObject(blankDocument(),'image',{fileAssetId:id,opacity:0.8,groupId:'group-1',image:{mask,offsetX:0.2,rotation:15,zoom:1.5,crop:{x:0.1,y:0.1,width:0.8,height:0.8},adjustments:{brightness:0.3,grayscale:true}}})
    assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))),doc)
  }
  for(const patch of [{mask:'url(https://example.com)'},{crop:{x:0.8,width:0.5}},{zoom:Infinity},{flipX:'true'},{adjustments:{blur:2}},{shadow:{color:'red'}}])assert.throws(()=>imageProperties(patch))
})
test('text variants require real local assets and line styles retain true geometry',()=>{
  for(const [fontFamily,fontVariant] of [['Oswald','light'],['Oswald','medium'],['Oswald','semibold'],['Lato','bold'],['Lato','italic']]){
    const doc=appendObject(blankDocument(),'text',{fontFamily,fontVariant,textAlign:'justify',lineHeight:1.4,charSpacing:35,underline:true,linethrough:true})
    assert.ok(studioFontStyle(fontFamily,fontVariant));assert.deepEqual(validateDocument(doc),doc)
  }
  assert.throws(()=>appendObject(blankDocument(),'text',{fontFamily:'Pacifico',fontVariant:'bold'}))
  const line=appendObject(blankDocument(),'line',{height:1,points:[[0,0],[1,1]],dash:'dotted',endArrow:true,strokeWidth:4})
  assert.deepEqual(validateDocument(line),line);assert.throws(()=>validateDocument({...line,schemaVersion:3}))
  assert.throws(()=>appendObject(blankDocument(),'line',{points:[[0,0],[5,5]]}))
})
test('safe SVG import produces monochrome paths, declares unverified license and rejects executable/external features',()=>{
  const input='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="#000000" d="M0 0L24 0L12 24Z"/></svg>'
  const result=importStudioSvg(input,'triangle.svg'),doc=appendObject(blankDocument(),'vector',result.object)
  assert.equal(doc.objects[0].svgName,'triangle.svg');assert.equal(doc.objects[0].iconId,undefined);assert.equal(result.provenance.license,'unspecified')
  for(const body of ['<script/>','<image href="https://example.com/x.png"/>','<foreignObject/>','<use href="#a"/>','<path style="fill:red" d="M0 0L1 1"/>','<path onload="x()" d="M0 0L1 1"/>','<path fill="url(x)" d="M0 0L1 1"/>'])assert.throws(()=>importStudioSvg(`<svg viewBox="0 0 24 24">${body}</svg>`))
  assert.throws(()=>importStudioSvg('<!DOCTYPE svg><svg/>'));assert.throws(()=>importStudioSvg(input.replace('24 24','100000 100000')))
})
