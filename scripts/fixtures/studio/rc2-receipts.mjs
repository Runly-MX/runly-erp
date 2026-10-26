import assert from 'node:assert/strict'
import {blankDocument,appendObject} from '../../../apps/shared/studio/document.js'
import {createStudioSync} from '../../../apps/desktop/src/modules/runly.studio/lib/studio-sync.js'
const sleep=ms=>new Promise(r=>setTimeout(r,ms))
export async function measureRc2Receipts(stack,{users,companies},{duration=120000}={}){
  const owner=users[0],company=companies[0],checks=[],profiles=[]
  assert.equal((await stack.pool.query('SELECT id FROM runly_studio_test.environment')).rows[0].id,stack.name)
  const login=await fetch(stack.urls.api+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:owner.email,password:owner.password})}),token=(await login.json()).data.access_token
  const request=async(path,data)=>{const r=await fetch(stack.urls.api+path,{method:data?'POST':'GET',headers:{Authorization:`Bearer ${token}`,'X-Runly-Company-Id':company.id,'X-Runly-Studio-Protocol':'2',...(data?{'Content-Type':'application/json'}:{})},body:data?JSON.stringify(data):undefined});const body=await r.json();assert.ok(r.ok,`${r.status}: ${JSON.stringify(body)}`);return body.data}
  for(const [kind,ms,interval,count]of [['typing',duration,20,1],['drag-commit',15000,1000,1],['group-transform',15000,200,200]]){
    let document=blankDocument(2000,2000)
    for(let i=0;i<count;i++)document=appendObject(document,kind==='typing'?'text':'rectangle',{id:`bench-${i}`,x:i%20*50,y:Math.floor(i/20)*50,...(kind==='typing'?{text:'Synthetic editing '.repeat(300)}:{groupId:'bench-group',width:30,height:30})})
    const record=await request('/studio/designs',{name:`RC2 receipt ${kind}`,document}),root=`/studio/designs/${record.id}`,latencies=[]
    const sizeBefore=Number((await stack.pool.query("SELECT pg_total_relation_size('audit_log')::text n")).rows[0].n)
    const sync=createStudioSync({document:record.document,revision:record.revision,name:record.name,clientId:`rc2-benchmark-${kind}`,actorId:owner.id,delay:80,editor:{apply:async d=>d},transport:{fetch:()=>request(root),send:async batch=>{await request('/studio/protocol');const start=performance.now(),result=await request(root+'/changes',batch);latencies.push(performance.now()-start);return result}}})
    const start=performance.now();let events=0
    try{
      while(performance.now()-start<ms){
        const doc=sync.state().document,n=++events
        sync.local({...doc,objects:doc.objects.map((o,i)=>kind==='typing'?{...o,text:`${document.objects[0].text} ${n}`}:{...o,x:document.objects[i].x+(n%100),y:document.objects[i].y+(n%100)})})
        await sleep(interval)
      }
      await sync.flush()
    }finally{sync.close()}
    const elapsedMs=performance.now()-start
    const stats=(await stack.pool.query(`SELECT count(*)::int batches,avg(pg_column_size(metadata))::float8 average_bytes,max(pg_column_size(metadata))::int max_bytes,sum(pg_column_size(metadata))::text metadata_bytes FROM audit_log WHERE entity_id=$1 AND metadata ? 'digest'`,[record.id])).rows[0]
    const sizeAfter=Number((await stack.pool.query("SELECT pg_total_relation_size('audit_log')::text n")).rows[0].n)
    const lookup=await stack.pool.query(`EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON) SELECT metadata FROM audit_log WHERE company_id=$1 AND actor_id=$2 AND entity_id=$3 AND entity_type='StudioDesign' AND module_key='runly.studio' AND action='studio.design.update' AND metadata ? 'digest' AND metadata ? 'result' AND metadata->>'clientId'=$4 AND metadata->>'batchId'='1'`,[company.id,owner.id,record.id,`rc2-benchmark-${kind}`])
    const payload={clientId:`rc2-benchmark-${kind}`,batchId:1}
    const receiptStart=performance.now();const receipt=await request(root+'/changes?'+new URLSearchParams(payload));assert.ok(receipt?.revision)
    const row={kind,events,elapsedMs,...stats,batchesPerSecond:stats.batches/(elapsedMs/1000),relationGrowthBytes:sizeAfter-sizeBefore,receiptHttpMs:performance.now()-receiptStart,lookupPlan:lookup.rows[0]['QUERY PLAN'],p95CommitMs:latencies.sort((a,b)=>a-b)[Math.floor(latencies.length*0.95)],estimated8HourMetadataBytes:Number(stats.metadata_bytes)/(elapsedMs/1000)*8*3600}
    profiles.push(row);console.log(`RC2 receipt measurement ${kind}: ${stats.batches} batches / ${(elapsedMs/1000).toFixed(1)} s`)
    assert.equal((await request(root)).revision,stats.batches+1)
  }
  checks.push('Real prolonged typing, drop commits and 200-member transforms: batching, SQL/TOAST size, p95, indexed receipt lookup and revision count measured')
  return {checks,profiles,retention:'No purge; receipts retained for the lifetime of the installation. Isolated RC2 is time/data bounded; production requires capacity monitoring before activation.'}
}
