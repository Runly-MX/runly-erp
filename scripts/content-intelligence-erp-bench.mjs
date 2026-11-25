// Explicitly isolated, synthetic real-ERP load. Not a production capacity test.
import { readFile,writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import assert from 'node:assert/strict';
import path from 'node:path';
const run=promisify(execFile),api=process.env.CI_CONTENT_API_URL;
if(!api||!['localhost','127.0.0.1'].includes(new URL(api).hostname))throw Error('Explicit loopback test API required');
const directory=path.resolve('.artifacts/content-intelligence/stage2-erp');
const settings=Object.fromEntries((await readFile(process.env.CI_CONTENT_ENV_FILE,'utf8')).replace(/^\uFEFF/,'').trim().split(/\r?\n/).map(line=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]));
assert.ok(settings.E2E_USER_EMAIL.endsWith('.example.test'));
const state=JSON.parse(await readFile(path.join(directory,'browser-state.json')));
const local=state.origins[0].localStorage;
const token=JSON.parse(local.find(row=>row.name==='sb-localhost-auth-token').value).access_token;
const company=local.find(row=>row.name==='runly-active-company').value;
const headers={Authorization:`Bearer ${token}`,'X-Runly-Company-Id':company};
const request=async(route,options={})=>{
 const response=await fetch(`${api}${route}`,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(15000)});
 const data=await response.json();assert.ok(response.ok,`${route} ${response.status}: ${JSON.stringify(data).slice(0,200)}`);return data;
};
const json=body=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
for(let attempt=0;attempt<30;attempt++) {
 const ready=await fetch(`${api}/health`).then(response=>response.ok).catch(()=>false);
 if(ready)break;
 if(attempt===29)throw Error('Isolated API failed to start');
 await new Promise(resolve=>setTimeout(resolve,1000));
}
const scopes=['instance','company'];
const policies=await Promise.all(scopes.map(async scope=>(await request(`/content/admin/${scope}`)).data.config));
const setPolicy=async(quality='balanced',profile='SMART',automaticProcessing=true)=>Promise.all(scopes.map((scope,i)=>request(`/content/admin/${scope}`,{...json({...policies[i],profile,quality,concurrency:1,historical:true,automaticProcessing,maxPending:20}),method:'PUT'})));
const names={api:process.env.CI_CONTENT_API_CONTAINER,db:process.env.CI_CONTENT_DB_CONTAINER,worker:'runly-content-erp-bench'};
const support=(process.env.CI_CONTENT_SUPPORT_CONTAINERS??'').split(',').filter(Boolean);
if(!names.api||!names.db||support.length!==6||!process.env.CI_CONTENT_DOCKER_NETWORK||!process.env.CI_CONTENT_WORKER_IMAGE)throw Error('Explicit isolated API, DB, six support containers, network and worker image required');
for(const name of [names.api,names.db,...support])assert.ok(name.startsWith('runly-content-'),'Only dedicated content test containers');
const docker=async args=>(await run('docker',args,{maxBuffer:8000000,timeout:120000})).stdout;
const stop=async()=>docker(['rm','-f',names.worker]).catch(()=>{});
const generated=await run('docker',['run','--rm','--network','none','--mount',`type=bind,source=${path.resolve('apps/content-worker')},target=/tests,readonly`,'--workdir','/tests',process.env.CI_CONTENT_WORKER_IMAGE,'python','generate_test_files.py'],{maxBuffer:6000000});
const fixtures=JSON.parse(generated.stdout);
async function upload(count=4) {
 const ids=[];
 for(let i=0;i<count;i++) {
  const [name,mime,bytes]=fixtures[i%fixtures.length],form=new FormData();
  form.set('file',new Blob([Buffer.from(bytes,'base64')],{type:mime}),`bench-${Date.now()}-${i}-${name}`);
  form.set('moduleKey','runly.files');form.set('entityType','AtlasFile');form.set('shareWithCompany','false');
  const id=(await request('/files/upload',{method:'POST',body:form})).data.id;ids.push(id);
 }
 return ids;
}
const percentile=(values,p)=>values.toSorted((a,b)=>a-b)[Math.min(values.length-1,Math.floor(values.length*p))];
const results=[];
const workerImageId=(await docker(['image','inspect','--format','{{.Id}}',process.env.CI_CONTENT_WORKER_IMAGE])).trim();
try {
 for(const [cpus,gb] of [[2,4],[4,8],[8,16]]) {
  const factor=cpus/2;
  await setPolicy('balanced','OFF');await stop();
  await docker(['update','--cpus',String(.5*factor),'--memory',`${768*factor}m`,'--memory-swap',`${768*factor}m`,names.api]);
  await docker(['update','--cpus',String(.25*factor),'--memory',`${1280*factor}m`,'--memory-swap',`${1280*factor}m`,names.db]);
  for(const name of support) {
    const storage=name.endsWith('supabase-storage'),realtime=name.endsWith('supabase-realtime'),kong=name.endsWith('supabase-kong'),auth=name.endsWith('supabase-auth');
    const memory=(storage?384:kong?512:realtime?256:128)*factor;
    const cpu=storage?0.25:kong?0.5:auth?0.1:0.05;
    await docker(['update','--cpus',String(cpu*factor),'--memory',`${memory}m`,'--memory-swap',`${memory}m`,name]);
    if((await docker(['inspect','--format','{{.State.Health.Status}}',name])).trim()==='unhealthy')await docker(['restart',name]);
  }
  const start=()=>docker(['run','-d','--name',names.worker,'--network',process.env.CI_CONTENT_DOCKER_NETWORK,'--env-file',path.join(directory,'worker.env'),
    '--cpus',String(.25*factor),'--memory',`${512*factor}m`,'--pids-limit','64','--read-only','--tmpfs','/tmp:size=268435456,mode=1777,noexec,nosuid,nodev',
    '--cap-drop','ALL','--security-opt','no-new-privileges:true',process.env.CI_CONTENT_WORKER_IMAGE]);
  for(const scenario of ['absent','idle','new','historical','accurate','pressure']) {
   let phaseFiles=[];
   if(scenario==='idle')await start();
   if(['new','accurate','pressure'].includes(scenario)){await setPolicy(scenario==='accurate'?'accurate':'balanced');phaseFiles=await upload(12);}
   if(scenario==='historical'){
    const uploadAt=Date.now();
    await setPolicy('balanced','OFF');phaseFiles=await upload(12);await setPolicy('balanced','SMART',false);
    await request('/content/admin/backfill',json({action:'start',filters:{mode:'never',fromDate:new Date(uploadAt-1000).toISOString()}}));
   }
   if(phaseFiles.length && scenario!=='pressure') {
    let observed=false;
    for(let poll=0;poll<30;poll++) {
      const state=(await request(`/content/files/${phaseFiles[0]}`)).data.state;
      if(['processing','done','empty','partial'].includes(state)){observed=true;break;}
      if(['failed','unsupported'].includes(state))throw Error(`OCR scenario failed: ${state}`);
      await new Promise(resolve=>setTimeout(resolve,1000));
    }
    assert.ok(observed,'Busy scenario must actually start processing');
   }
   let stress;
   if(scenario==='pressure')stress=run('docker',['exec',names.worker,'python','-c',"import time; b=bytearray(300*1048576);end=time.monotonic()+15\nwhile time.monotonic()<end: sum(range(100000))"],{maxBuffer:1000}).catch(()=>{});
   const routes=['/files?limit=20','/content/search?q=ABC123XYZ&searchIn=ocr','/inventory/items?limit=20','/purchases/dashboard','/pos/sessions?limit=20','/user/me'];
   // Warm every route before comparable sampling; first-load module SQL/cache
   // initialization otherwise makes the absent-worker baseline misleading.
   for(let round=0;round<6;round++)await Promise.all(routes.map(route=>request(route)));
   const timings=Object.fromEntries(routes.map(route=>[route,[]])),errors=[];
   const began=performance.now();
   for(let round=0;round<24;round++) {
    await Promise.all(routes.map(async route=>{
     const at=performance.now();try{await request(route);}catch(error){errors.push({route,message:error.message});}
     timings[route].push(performance.now()-at);
    }));
    await new Promise(resolve=>setTimeout(resolve,150));
   }
   const stats=await docker(['stats','--no-stream','--format','{{json .}}',names.api,names.db,...(scenario!=='absent'?[names.worker]:[])]);
   const database=await docker(['exec',names.db,'psql','-U','postgres','-d','postgres','-At','-c',"SELECT json_build_object('connections',(SELECT count(*) FROM pg_stat_activity),'databaseBytes',pg_database_size(current_database()),'contentIndexBytes',coalesce((SELECT sum(pg_indexes_size(oid)) FROM pg_class WHERE relnamespace='runly_content'::regnamespace),0),'jobs',(SELECT json_object_agg(state,n) FROM (SELECT state,sum(jobs) n FROM runly_content.totals GROUP BY state) x))"]);
   for(const id of phaseFiles)assert.match(id,/^[0-9a-f-]{36}$/);
   const processing=phaseFiles.length?JSON.parse((await docker(['exec',names.db,'psql','-U','postgres','-d','postgres','-At','-c',
    `SELECT json_build_object('started',count(*) FILTER(WHERE attempts>0),'finished',count(*) FILTER(WHERE state IN ('done','empty','partial')),'ocr',count(*) FILTER(WHERE EXISTS(SELECT 1 FROM runly_content.page p WHERE p.job_id=j.id AND p.source='ocr'))) FROM runly_content.job j WHERE file_id=ANY(ARRAY[${phaseFiles.map(id=>`'${id}'`).join(',')}]::uuid[])`])).trim()):null;
   results.push({budget:{cpus,gb,boundedContainers:9,allocatedMemoryMiB:4096*factor},scenario,seconds:(performance.now()-began)/1000,errors,
    requests:routes.length*24,latency:Object.fromEntries(Object.entries(timings).map(([route,values])=>[route,{samples:values.length,p50:percentile(values,.5),p95:percentile(values,.95),p99:percentile(values,.99)}])),
    stats:stats.trim().split('\n').map(line=>JSON.parse(line)),database:JSON.parse(database.trim()),processing});
   await writeFile(path.join(directory,'erp-benchmark.json'),JSON.stringify({synthetic:true,workerImageId,scope:'Real ERP API + PostgreSQL + Auth/Storage/REST/Kong/Realtime/imgproxy, dedicated containers; not a VM/host capacity claim',results},null,2));
   console.log(JSON.stringify({cpus,scenario,errors:errors.length,filesP95:results.at(-1).latency['/files?limit=20'].p95}));
   if(stress)await stress;
   if(['new','historical','accurate','pressure'].includes(scenario)){
    await setPolicy('balanced','OFF');
    for(const id of phaseFiles)await request(`/content/files/${id}/cancel`,json({}));
   }
  }
  await stop();
 }
} finally {
 await stop();
 await Promise.all(scopes.map((scope,i)=>request(`/content/admin/${scope}`,{...json(policies[i]),method:'PUT'})));
}
