// 1,000 mixed originals in real, isolated ERP Storage. Never target an operational instance.
import {readFile,writeFile} from 'node:fs/promises';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import assert from 'node:assert/strict';
import path from 'node:path';
const run=promisify(execFile),api=process.env.CI_CONTENT_API_URL,image=process.env.CI_CONTENT_WORKER_IMAGE,network=process.env.CI_CONTENT_DOCKER_NETWORK;
const db=process.env.CI_CONTENT_DB_CONTAINER,output=path.resolve('.artifacts/content-intelligence/stage2-erp');
if(!api||!['localhost','127.0.0.1'].includes(new URL(api).hostname)||!image||!network||!db?.startsWith('runly-content-'))throw Error('Explicit isolated test targets required');
const privateEnv=await readFile(process.env.CI_CONTENT_ENV_FILE,'utf8');
assert.ok(privateEnv.match(/^E2E_USER_EMAIL=(.+)$/m)?.[1].trim().endsWith('.example.test'),'Synthetic credentials required');
const state=JSON.parse(await readFile(path.join(output,'browser-state.json'))),local=state.origins[0].localStorage;
const company=local.find(row=>row.name==='runly-active-company').value;
const token=JSON.parse(local.find(row=>row.name==='sb-localhost-auth-token').value).access_token;
assert.match(company,/^[0-9a-f-]{36}$/);
const headers={Authorization:`Bearer ${token}`,'X-Runly-Company-Id':company};
const request=async(route,options={})=>{const response=await fetch(api+route,{...options,headers:{...headers,...options.headers},signal:AbortSignal.timeout(30000)});const body=await response.json();assert.ok(response.ok,`${route} ${response.status}`);return body;};
const json=body=>({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const docker=async args=>(await run('docker',args,{maxBuffer:10000000,timeout:180000})).stdout;
const scopes=['instance','company'],policies=await Promise.all(scopes.map(async scope=>(await request(`/content/admin/${scope}`)).data.config));
const configure=async profile=>Promise.all(scopes.map((scope,i)=>request(`/content/admin/${scope}`,{...json({...policies[i],profile,automaticProcessing:false,historical:true,quality:'balanced',concurrency:4,maxPending:20}),method:'PUT'})));
const workers=Array.from({length:4},(_,i)=>`runly-content-historical-${i+1}`);
const prefix=`bulk-stage2-${Date.now()}`;
const fixtures=JSON.parse(await docker(['run','--rm','--network','none','--mount',`type=bind,source=${path.resolve('apps/content-worker')},target=/tests,readonly`,'--workdir','/tests',image,'python','generate_test_files.py']));
const record={prefix,originals:1000,synthetic:true,workerCount:4,workerCpu:.5,workerMemoryMiB:1024,quality:'balanced',maximumQueue:0,samples:[],restart:false,pauseResume:false};
try {
 await configure('OFF');
 const uploadAt=Date.now();
 for(let n=0;n<1000;n++) {
  const [name,mime,base64]=fixtures[n%fixtures.length],form=new FormData();
  form.set('file',new Blob([Buffer.from(base64,'base64')],{type:mime}),`${prefix}-${n}-${name}`);
  form.set('moduleKey','runly.files');form.set('entityType','AtlasFile');form.set('shareWithCompany','false');
  await request('/files/upload',{method:'POST',body:form});
  if((n+1)%100===0)console.log(JSON.stringify({uploaded:n+1}));
 }
 record.uploadSeconds=(Date.now()-uploadAt)/1000;
 const query=`SELECT json_build_object('registered',count(*),'terminal',count(*) FILTER(WHERE j.state NOT IN ('pending','processing')),'queued',count(*) FILTER(WHERE j.state IN ('pending','processing')),'failed',count(*) FILTER(WHERE j.state IN ('failed','unsupported','cancelled')),'partial',count(*) FILTER(WHERE j.state='partial'),'ocr',count(*) FILTER(WHERE EXISTS(SELECT 1 FROM runly_content.page p WHERE p.job_id=j.id AND p.source='ocr')),'digital',count(*) FILTER(WHERE EXISTS(SELECT 1 FROM runly_content.page p WHERE p.job_id=j.id AND p.source='digital')),'formats',(SELECT json_object_agg(mime_type,n) FROM (SELECT mime_type,count(*) n FROM file_asset WHERE original_name LIKE '${prefix}-%' GROUP BY mime_type) x)) FROM file_asset f LEFT JOIN runly_content.job j ON j.file_id=f.id WHERE f.original_name LIKE '${prefix}-%' AND f.entity_id='${company}'::uuid`;
 const stats=async()=>JSON.parse((await docker(['exec',db,'psql','-U','postgres','-d','postgres','-At','-c',query])).trim());
 assert.equal((await stats()).queued,0);
 await configure('SMART');
 await request('/content/admin/backfill',json({action:'start',filters:{mode:'never',fromDate:new Date(uploadAt-1000).toISOString()}}));
 for(let i=0;i<workers.length;i++)await docker(['run','-d','--name',workers[i],'--network',network,'--env-file',path.join(output,'worker.env'),'--env',`RUNLY_CONTENT_WORKER_ID=historical-${i+1}`,'--cpus','.5','--memory','1g','--pids-limit','64','--read-only','--tmpfs','/tmp:size=268435456,mode=1777,noexec,nosuid,nodev','--cap-drop','ALL','--security-opt','no-new-privileges:true',image]);
 const began=Date.now();
 for(;;) {
  const sample=await stats();record.maximumQueue=Math.max(record.maximumQueue,sample.queued);record.samples.push({seconds:(Date.now()-began)/1000,...sample});
  await writeFile(path.join(output,'historical-mixed.json'),JSON.stringify(record,null,2));
  if(record.samples.length%6===1)console.log(JSON.stringify(record.samples.at(-1)));
  if(sample.terminal>=1000)break;
  if(!record.pauseResume&&sample.terminal>=100){await request('/content/admin/backfill',json({action:'pause'}));await new Promise(resolve=>setTimeout(resolve,2000));await request('/content/admin/backfill',json({action:'resume'}));record.pauseResume=true;}
  if(!record.restart&&sample.terminal>=200){await docker(['restart',workers[0]]);record.restart=true;}
  if(Date.now()-began>1800000)throw Error('Historical benchmark deadline');
  await new Promise(resolve=>setTimeout(resolve,5000));
 }
 record.seconds=(Date.now()-began)/1000;
 record.final=record.samples.at(-1);record.dockerStats=(await docker(['stats','--no-stream','--format','{{json .}}',...workers])).trim().split('\n').map(line=>JSON.parse(line));
 record.attempts=JSON.parse((await docker(['exec',db,'psql','-U','postgres','-d','postgres','-At','-c',`SELECT json_build_object('attempts',count(*),'cpuMs',coalesce(sum(cpu_ms),0),'peakProcessRssBytes',max(peak_rss_bytes),'secondPasses',coalesce(sum(second_passes),0)) FROM runly_content.attempt a JOIN runly_content.job j ON j.id=a.job_id JOIN file_asset f ON f.id=j.file_id WHERE f.original_name LIKE '${prefix}-%'`])).trim());
 await writeFile(path.join(output,'historical-mixed.json'),JSON.stringify(record,null,2));
 assert.ok(record.maximumQueue<=20);assert.equal(record.final.failed,0);assert.equal(record.final.partial,0);
 console.log(JSON.stringify({complete:record.final,seconds:record.seconds,maximumQueue:record.maximumQueue}));
} finally {
 await configure('OFF');
 await docker(['rm','-f',...workers]).catch(()=>{});
 await Promise.all(scopes.map((scope,i)=>request(`/content/admin/${scope}`,{...json(policies[i]),method:'PUT'})));
}
