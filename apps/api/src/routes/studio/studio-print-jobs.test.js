import test from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import {PDFDocument, PDFName} from 'pdf-lib'
import {blankDocument,validateDocument} from '../../../../shared/studio/document.js'
import {applyOps} from '../../../../shared/studio/operations.js'
import {createStudioPrintJobs} from './studio-print-jobs.js'

function fixture(extra={}) {
  const doc=validateDocument(applyOps(blankDocument(240,160),[2,3,4,5].map(n=>({type:'addPage',scene:{page:{id:`p${n}`,width:n%2?240:160,height:n%2?160:240,background:'#ffffff'},objects:[]}}))))
  let revision=1,denied=false,assets=false
  const jobs=createStudioPrintJobs({getDesign:async()=>{if(denied)throw Object.assign(Error('revoked'),{status:403});return {revision,document:doc,name:'Synthetic multipage'}},authorizeAssets:async()=>{if(assets)throw Object.assign(Error('asset disabled'),{status:403})},...extra})
  const input={revision:1,pages:['page-1','p2','p3','p4','p5'].map(pageId=>({pageId,ppi:300})),bleed:false,cropMarks:false,profile:'rgb'}
  return {jobs,input,doc,revoke:()=>{denied=true},change:()=>{revision++},disableAsset:()=>{assets=true}}
}
test('progressive PDF preserves five pages, document order, orientation and colour space in RGB and CMYK',async()=>{
  for(const profile of ['rgb','cmyk']){
    const {jobs,input}=fixture(),job=await jobs.create('company','actor','design',{...input,profile,pages:[...input.pages].reverse()})
    assert.equal(job.pages[0].pageId,'page-1');assert.equal(job.pages[4].pageId,'p5')
    for(const [index,page]of job.pages.entries()){
      const image=await sharp({create:{width:page.width,height:page.height,channels:3,background:['#ff0000','#00ff00','#0000ff','#ffff00','#ff00ff'][index]}}).png().toBuffer()
      const result=await jobs.append('company','actor','design',job.id,page.pageId,image)
      assert.equal(result.completed,index+1)
    }
    const bytes=await jobs.finish('company','actor','design',job.id),pdf=await PDFDocument.load(bytes)
    assert.equal(pdf.getPageCount(),5)
    for(const [index,page]of pdf.getPages().entries()){
      assert.equal(page.getWidth()>page.getHeight(),index%2===0)
      assert.ok(Math.abs(page.getTrimBox().width-job.pages[index].widthMm*72/25.4)<0.001)
    }
    // JPEG headers in the embedded streams carry the chosen number of channels;
    // pdf-lib also declares DeviceRGB/DeviceCMYK on each image object.
    const images=pdf.context.enumerateIndirectObjects().map(([,o])=>o).filter(o=>o.dict?.get?.(PDFName.of('Subtype'))?.toString()==='/Image')
    assert.ok(bytes.length>1000);assert.equal(images.length,5);assert.ok(images.every(o=>o.dict.get(PDFName.of('ColorSpace')).toString()===(profile==='rgb'?'/DeviceRGB':'/DeviceCMYK')))
    await assert.rejects(jobs.finish('company','actor','design',job.id),{status:404})
  }
})
test('jobs reject cross-actor access, stale revisions, wrong page order and oversized ranges',async()=>{
  const {jobs,input}=fixture(),job=await jobs.create('c','a','d',input)
  await assert.rejects(jobs.append('c','other','d',job.id,'page-1',Buffer.from('x')),{status:404})
  await assert.rejects(jobs.create('c','a','d',input),{status:429})
  await assert.rejects(jobs.append('c','a','d',job.id,'p2',Buffer.from('x')),{status:409})
  const next=await jobs.create('c','a','d',input)
  await jobs.cancel('c','a','d',next.id)
  await assert.rejects(jobs.create('c','a','d',{...input,revision:2}),{status:409})
  await assert.rejects(jobs.create('c','a','d',{...input,pages:[]}),{status:400})
  await assert.rejects(jobs.create('c','a','d',{...input,pages:[input.pages[0],input.pages[0]]}),{status:400})
})
test('cancel, abort, revocation and concurrent edits discard all output, retaining the native processing slot',async()=>{
  for(const reason of ['cancel','abort','revoke','asset','revision']){
    let release,started
    const gate=new Promise(resolve=>{release=resolve}),entered=new Promise(resolve=>{started=resolve})
    const f=fixture({builder:async()=>{started();await gate;return Buffer.from('not consumed after cancellation')}})
    const job=await f.jobs.create('c','a','d',f.input),controller=new AbortController()
    const pending=f.jobs.append('c','a','d',job.id,'page-1',Buffer.from('synthetic'),controller.signal)
    await entered
    if(reason==='cancel')await f.jobs.cancel('c','a','d',job.id)
    if(reason==='abort')controller.abort()
    if(reason==='revoke')f.revoke()
    if(reason==='asset')f.disableAsset()
    if(reason==='revision')f.change()
    if(['cancel','abort'].includes(reason))await assert.rejects(f.jobs.create('c','a','d',f.input),{status:429})
    release();await assert.rejects(pending)
    await assert.rejects(f.jobs.finish('c','a','d',job.id),{status:404})
  }
})
test('subset keeps document order and pixel budgets reject excessive aggregate resolution before rendering',async()=>{
  const f=fixture(),job=await f.jobs.create('c','a','d',{...f.input,pages:[f.input.pages[3],f.input.pages[0]]})
  assert.deepEqual(job.pages.map(p=>p.pageId),['page-1','p4']);await f.jobs.cancel('c','a','d',job.id)
  const document=validateDocument(applyOps(blankDocument(4096,4096),Array.from({length:15},(_,n)=>({type:'duplicatePage',pageId:'page-1',newId:`p${n+2}`}))))
  const jobs=createStudioPrintJobs({getDesign:async()=>({revision:1,document,name:'Synthetic limit'}),authorizeAssets:async()=>{}})
  await assert.rejects(jobs.create('c','a','d',{...f.input,pages:[{pageId:'page-1',ppi:96}]}),{status:413})
  await assert.rejects(jobs.create('c','a','d',{...f.input,pages:[document,...document.additionalPages].map(p=>({pageId:p.page.id,ppi:300}))}),{status:413})
})
