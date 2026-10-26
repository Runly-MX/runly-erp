import test from 'node:test'
import assert from 'node:assert/strict'
import {blankDocument,appendObject,validateDocument} from './document.js'
import {DEFAULT_GRADIENT,gradientPaint,gradientGeometry,reverseGradient,editGradientStop} from './gradient.js'
import {createSnapIndex,snapBounds,snappingOptions,gridOptions,viewportReferences} from './snapping.js'
import {transformStudioGroup} from './group-transform.js'
import {reviewStudioDocument} from '../../api/src/routes/studio/studio-review.js'
import {resizeDocument} from './page.js'
const paint=()=>structuredClone(DEFAULT_GRADIENT)
test('v6 paints and page survive JSON/resize; v1-v5 upgrade; future/unsafe paints fail closed',()=>{
  let doc=appendObject(blankDocument(),'rectangle',{fillPaint:paint()})
  doc.page.backgroundPaint={type:'gradient',gradientType:'radial',centerX:0.3,centerY:0.7,radius:0.8,stops:paint().stops}
  assert.deepEqual(validateDocument(JSON.parse(JSON.stringify(doc))),doc)
  assert.deepEqual(resizeDocument(doc,{width:800,height:600}).page.backgroundPaint,doc.page.backgroundPaint)
  for(const schemaVersion of [1,2,3,4,5])assert.equal(validateDocument({...blankDocument(),schemaVersion}).schemaVersion,6)
  for(const schemaVersion of [1,2,3,4,5])assert.throws(()=>validateDocument({...doc,schemaVersion}))
  for(const change of [{gradientType:'conic'},{angle:Infinity},{angle:361},{stops:[]},{stops:Array(13).fill(paint().stops[0])},
    {stops:[{offset:0,color:'url(example)',opacity:1},paint().stops[1]]},
    {stops:[{offset:0,color:'#ffffff',opacity:-0.1},paint().stops[1]]},
    {stops:[paint().stops[1],paint().stops[0]]},
    {stops:[paint().stops[0],paint().stops[0]]}])assert.throws(()=>gradientPaint({...paint(),...change}))
  assert.throws(()=>gradientPaint({...doc.page.backgroundPaint,radius:0}))
  assert.throws(()=>appendObject(blankDocument(),'text',{fillPaint:paint()}))
  const twelve={...paint(),stops:Array.from({length:12},(_,i)=>({offset:i/11,color:'#abcdef',opacity:i/11}))}
  assert.equal(gradientPaint(twelve).stops.length,12)
})
test('gradient geometry has explicit rectangular projection and radial radius; edit/reverse preserve opacity',()=>{
  assert.deepEqual(gradientGeometry(paint(),200,100),{x1:0,y1:50,x2:200,y2:50})
  assert.equal(gradientGeometry({gradientType:'radial',centerX:0.5,centerY:0.25,radius:0.5},200,100).r2,50)
  const edited=editGradientStop(paint(),0,{offset:0.2,opacity:0.3})
  assert.equal(reverseGradient(edited).stops[1].opacity,0.3)
  assert.equal(reverseGradient(edited).stops[1].offset,0.8)
  assert.throws(()=>editGradientStop(paint(),0,{offset:1}))
})
test('contrast review treats gradients as manual until an opaque solid fully covers them',()=>{
  const doc=appendObject(blankDocument(),'text',{x:20,y:20,width:100,height:60,text:'Test'})
  doc.page.backgroundPaint=paint()
  assert.ok(reviewStudioDocument(doc).findings.some(f=>f.rule==='requires_manual_review'))
  assert.ok(!reviewStudioDocument(doc).findings.some(f=>f.rule==='low_contrast'))
})
test('snap index excludes own/hidden members, uses screen pixels, Alt disables, spacing and grid are independent',()=>{
  const box={left:42,top:100,width:20,height:20}
  const refs=[{id:'a',left:0,top:100,width:20,height:20},{id:'b',left:80,top:100,width:20,height:20},{id:'hidden',hidden:true,left:41,top:100,width:20,height:20}]
  const index=createSnapIndex({width:400,height:300},refs,['self'])
  const options=snappingOptions({page:false})
  const result=snapBounds(index,box,{options})
  assert.equal(result.dx,-2);assert.ok(result.guides.some(g=>g.kind==='spacing'&&g.gap===20))
  assert.equal(snapBounds(index,box,{options,disabled:true}).dx,0)
  const pageIndex=createSnapIndex({width:400,height:300},[])
  assert.equal(snapBounds(pageIndex,{left:170,top:20,width:40,height:20},{zoom:0.5}).dx,10)
  assert.equal(snapBounds(pageIndex,{left:170,top:20,width:40,height:20},{zoom:2}).dx,0)
  assert.equal(snapBounds(pageIndex,box,{options:snappingOptions({page:false,objects:false,grid:true}),grid:gridOptions({size:10})}).dx,-2)
  assert.equal(createSnapIndex({width:400,height:300},refs,['a','b']).axes.x.length,3)
  const view=viewportReferences({width:400,height:300},{zoom:2,panX:-40,panY:5},gridOptions({visible:true,rulers:true,size:20}))
  assert.equal(view.x[1].screen,0);assert.equal(view.y[1].screen,45)
  assert.throws(()=>gridOptions({size:0}));assert.throws(()=>snappingOptions({threshold:NaN}))
})
test('flat group similarity transform is atomic, rotates around explicit origin, preserves paint and bounds',()=>{
  let doc=appendObject(blankDocument(),'rectangle',{x:100,y:100,groupId:'g',rotation:30,fillPaint:paint(),shape:{radius:10,strokeWidth:2}})
  doc=appendObject(doc,'text',{x:200,y:100,groupId:'g',text:'Test'})
  const result=transformStudioGroup(doc,'g',{scale:2,rotation:90,origin:{x:100,y:100}})
  assert.equal(result.objects[0].rotation,120);assert.equal(result.objects[0].shape.radius,20)
  assert.ok(Math.abs(result.objects[1].x-100)<1e-10);assert.equal(result.objects[1].y,300)
  assert.equal(result.objects[1].scaleX,2);assert.deepEqual(result.objects[0].fillPaint,doc.objects[0].fillPaint)
  assert.throws(()=>transformStudioGroup(doc,'g',{scaleX:2,origin:{x:0,y:0}}))
  assert.throws(()=>transformStudioGroup({...doc,objects:doc.objects.map(o=>({...o,locked:true}))},'g',{origin:{x:0,y:0}}))
  assert.deepEqual(doc.objects[0].shape.radius,10)
})
