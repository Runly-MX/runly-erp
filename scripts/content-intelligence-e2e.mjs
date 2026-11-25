// Isolated real-ERP browser checks. Requires explicitly configured loopback URLs and synthetic credentials.
import { chromium } from 'playwright';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const run=promisify(execFile);

const envFile=process.env.CI_CONTENT_ENV_FILE;
if (!envFile) throw Error('CI_CONTENT_ENV_FILE is required');
const env=Object.fromEntries((await readFile(envFile,'utf8')).replace(/^\uFEFF/,'').trim().split('\n').map(line=>[line.slice(0,line.indexOf('=')),line.slice(line.indexOf('=')+1)]));
const ui=process.env.CI_CONTENT_UI_URL,api=process.env.CI_CONTENT_API_URL;
for (const value of [ui,api]) if (!value || !['localhost','127.0.0.1'].includes(new URL(value).hostname)) throw Error('Explicit isolated loopback URLs are required');
if (!env.E2E_USER_EMAIL?.endsWith('.example.test') || !env.E2E_USER_PASSWORD) throw Error('Synthetic test credentials required');
const output=path.resolve('.artifacts/content-intelligence/stage2-erp');
await mkdir(output,{recursive:true});
for(let attempt=0;attempt<30;attempt++) {
  const ready=await fetch(`${api}/health`).then(response=>response.ok).catch(()=>false);
  if(ready)break;
  if(attempt===29)throw Error('Isolated API failed to start');
  await new Promise(resolve=>setTimeout(resolve,1000));
}
const browser=await chromium.launch({headless:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}});
const page=await context.newPage();
try {
  await page.goto(`${ui}/app/login`,{waitUntil:'domcontentloaded'});
  await page.locator('#identifier').fill(env.E2E_USER_EMAIL);
  await page.locator('#password').fill(env.E2E_USER_PASSWORD);
  await page.getByRole('button',{name:'Iniciar sesión',exact:true}).click();
  await page.waitForURL(url=>url.pathname.startsWith('/app/'),{timeout:45000});
  await page.getByRole('button',{name:'Iniciar sesión',exact:true}).waitFor({state:'hidden'});
  await page.getByText('Todas las aplicaciones',{exact:false}).waitFor();
  await context.storageState({path:path.join(output,'browser-state.json')});
  await page.screenshot({path:path.join(output,'home.png')});
  await writeFile(path.join(output,'home-text.txt'),await page.locator('body').innerText());
  await page.goto(`${ui}/app/m/runly.core/settings`);
  await page.getByRole('heading',{name:'Procesamiento inteligente de archivos · Instancia',exact:true}).waitFor();
  const credentials=await page.evaluate(()=>({token:JSON.parse(localStorage.getItem('sb-localhost-auth-token')).access_token,company:localStorage.getItem('runly-active-company')}));
  const headers={Authorization:`Bearer ${credentials.token}`,'X-Runly-Company-Id':credentials.company};
  const request=async(route,options={})=>{
    const response=await fetch(`${api}${route}`,{...options,headers:{...headers,...options.headers}});
    const body=await response.json();assert.ok(response.ok,`${route}: ${response.status} ${JSON.stringify(body)}`);return body;
  };
  for (const scope of ['instancia','empresa']) {
    const card=page.locator(`[aria-label="Procesamiento de ${scope}"]`);
    await card.getByRole('button',{name:'Perfil'}).click();
    await page.getByRole('option',{name:'Inteligente',exact:true}).click();
    if (!await card.getByLabel('Autorizar indexación histórica',{exact:true}).isChecked()) await card.getByText('Autorizar indexación histórica',{exact:true}).click();
    const saved=page.waitForResponse(response=>response.request().method()==='PUT'&&response.url().endsWith(`/content/admin/${scope==='instancia'?'instance':'company'}`));
    await card.getByRole('button',{name:'Guardar política',exact:true}).click();
    assert.equal((await saved).status(),200);
  }
  await page.reload();
  await page.locator('[aria-label="Procesamiento de empresa"]').getByText('Inteligente',{exact:true}).waitFor();
  for (const width of [1440,768,390,320]) {
    await page.setViewportSize({width,height:1000});
    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);
    await page.screenshot({path:path.join(output,`settings-${width}.png`),fullPage:true});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Horizontal overflow at ${width}`);
  }
  if (process.env.CI_CONTENT_WORKER_IMAGE) {
    const network=process.env.CI_CONTENT_DOCKER_NETWORK;
    if (!network) throw Error('Explicit isolated Docker network required');
    const generated=await run('docker',['run','--rm','--network','none','--mount',`type=bind,source=${path.resolve('apps/content-worker')},target=/tests,readonly`,'--workdir','/tests',process.env.CI_CONTENT_WORKER_IMAGE,'python3','-c',"from test_worker import label;import sys;label().save(sys.stdout.buffer,'PNG')"],{encoding:'buffer',maxBuffer:2000000});
    const form=new FormData();form.set('file',new Blob([generated.stdout],{type:'image/png'}),'equipo-sintetico.png');form.set('entityType','AtlasFile');form.set('moduleKey','runly.files');form.set('shareWithCompany','false');
    const upload=await request('/files/upload',{method:'POST',body:form});
    const file=upload.data;
    assert.ok(file?.id,'Upload returned no file');
    const pdfSource=await run('docker',['run','--rm','--network','none','--mount',`type=bind,source=${path.resolve('apps/content-worker')},target=/tests,readonly`,'--workdir','/tests',process.env.CI_CONTENT_WORKER_IMAGE,'python3','-c',"from test_worker import make_pdf;import tempfile,pathlib,sys;d=tempfile.TemporaryDirectory();p=pathlib.Path(d.name)/'scan.pdf';make_pdf(p,['image']);sys.stdout.buffer.write(p.read_bytes())"],{encoding:'buffer',maxBuffer:2000000});
    const pdfForm=new FormData();pdfForm.set('file',new Blob([pdfSource.stdout],{type:'application/pdf'}),'escaneo-sintetico.pdf');pdfForm.set('entityType','AtlasFile');pdfForm.set('moduleKey','runly.files');pdfForm.set('shareWithCompany','false');
    const pdfFile=(await request('/files/upload',{method:'POST',body:pdfForm})).data;
    const exifSource=await run('docker',['run','--rm','--network','none','--mount',`type=bind,source=${path.resolve('apps/content-worker')},target=/tests,readonly`,'--workdir','/tests',process.env.CI_CONTENT_WORKER_IMAGE,'python3','-c',"from test_worker import label;from PIL import Image;import sys;e=Image.Exif();e[274]=6;label().rotate(90,expand=True).save(sys.stdout.buffer,'JPEG',exif=e)"],{encoding:'buffer',maxBuffer:2000000});
    const exifForm=new FormData();exifForm.set('file',new Blob([exifSource.stdout],{type:'image/jpeg'}),'exif-sintetico.jpg');exifForm.set('entityType','AtlasFile');exifForm.set('moduleKey','runly.files');exifForm.set('shareWithCompany','false');
    const exifFile=(await request('/files/upload',{method:'POST',body:exifForm})).data;
    const workerEnv=path.join(output,'worker.env');
    await writeFile(workerEnv,`RUNLY_CONTENT_API_URL=http://api:4010\nRUNLY_CONTENT_WORKER_TOKEN=${env.RUNLY_CONTENT_WORKER_TOKEN}\nRUNLY_CONTENT_WORKER_ID=browser-e2e\n`);
    const name='runly-content-browser-e2e';
    await run('docker',['run','-d','--name',name,'--network',network,'--cpus','0.5','--memory','512m','--pids-limit','64','--read-only','--tmpfs','/tmp:size=268435456,mode=1777,noexec,nosuid,nodev','--cap-drop','ALL','--security-opt','no-new-privileges:true','--env-file',workerEnv,process.env.CI_CONTENT_WORKER_IMAGE]);
    try {
      for(let poll=0;poll<30;poll++) {
        const connected=(await request('/content/admin/instance')).data.workers.some(worker=>worker.id==='browser-e2e'&&worker.connected);
        if(connected)break;
        if(poll===29)throw Error('Worker heartbeat missing');
        await new Promise(resolve=>setTimeout(resolve,1000));
      }
      // These originals may predate the first live heartbeat. Explicit manual
      // requests keep the viewer check independent of reconciliation scan size.
      for(const source of [file,pdfFile,exifFile]) {
        const response=await fetch(`${api}/content/files/${source.id}/process`,{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({quality:'balanced',reprocess:false})});
        if(response.status===409)assert.ok(['pending','processing','done'].includes((await request(`/content/files/${source.id}`)).data.state));
        else assert.equal(response.status,202);
      }
      const began=Date.now();let result;
      do {
        await new Promise(resolve=>setTimeout(resolve,1000));
        result=(await request(`/content/files/${file.id}`)).data;
      } while (!['done','failed','unsupported'].includes(result.state)&&Date.now()-began<90000);
      assert.equal(result.state,'done');
      assert.ok(result.pages[0].text.includes('ABC123XYZ'));
      await page.setViewportSize({width:1440,height:1000});
      await page.goto(`${ui}/app/m/runly.files/files?searchIn=ocr&q=ABC123XYZ`);
      await page.getByText('equipo-sintetico.png',{exact:true}).first().waitFor();
      await page.getByRole('gridcell').filter({has:page.getByText('equipo-sintetico.png',{exact:true})}).first().dblclick();
      await page.getByRole('dialog').getByRole('heading',{name:'Texto del archivo'}).waitFor();
      await page.getByPlaceholder('Buscar en el texto…').fill('ABC123XYZ');
      await page.locator('[data-ocr-overlay] rect').first().waitFor();
      for (const width of [1440,768,390,320]) {
        await page.setViewportSize({width,height:1000});await page.waitForTimeout(400);
        await page.screenshot({path:path.join(output,`viewer-${width}.png`)});
        assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`Viewer overflow at ${width}`);
      }
      await page.setViewportSize({width:1440,height:1000});
      await page.getByRole('button',{name:/^Aumentar zoom/}).click();
      await page.getByRole('button',{name:/^Rotar derecha/}).click();
      await page.waitForTimeout(400);
      const geometry=await page.locator('[data-ocr-overlay]').evaluate(svg=>{
        const a=svg.getBoundingClientRect(),b=svg.parentElement.querySelector('img').getBoundingClientRect();
        return ['x','y','width','height'].every(key=>Math.abs(a[key]-b[key])<1);
      });
      assert.ok(geometry,'Overlay and image must share zoom/rotation geometry');
      await page.keyboard.press('Tab');
      assert.ok(await page.getByRole('dialog').evaluate(dialog=>dialog.contains(document.activeElement)),'Keyboard focus stays in viewer');
      await page.evaluate(()=>document.documentElement.classList.add('dark'));
      await page.screenshot({path:path.join(output,'viewer-dark-rotated.png')});
      await page.getByRole('button',{name:/^Restablecer todo/}).click();
      await page.setViewportSize({width:390,height:1000});
      await page.waitForTimeout(400);
      await page.screenshot({path:path.join(output,'viewer-dark-390.png')});
      const touch=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true,storageState:await context.storageState()});
      try {
        const mobile=await touch.newPage();
        await mobile.goto(`${ui}/app/m/runly.files/files?searchIn=ocr&q=ABC123XYZ`);
        const tile=mobile.getByRole('gridcell').filter({has:mobile.getByText('equipo-sintetico.png',{exact:true})}).first();
        await tile.tap();
        await mobile.getByPlaceholder('Buscar en el texto…').fill('ABC123XYZ');
        await mobile.getByRole('button',{name:'Coincidencia siguiente',exact:true}).tap();
        await mobile.locator('[data-ocr-overlay] rect').first().waitFor();
        await mobile.screenshot({path:path.join(output,'viewer-touch-390.png')});
      } finally {await touch.close();}
      let exifResult;const exifBegan=Date.now();
      do {exifResult=(await request(`/content/files/${exifFile.id}`)).data;if(exifResult.state!=='done')await new Promise(resolve=>setTimeout(resolve,1000));}
      while(exifResult.state!=='done'&&Date.now()-exifBegan<90000);
      assert.equal(exifResult.state,'done');
      assert.equal(exifResult.pages[0].engine.canvas.width,1800);
      await page.keyboard.press('Escape');
      await page.goto(`${ui}/app/m/runly.files/files?searchIn=all&q=exif-sintetico.jpg`);
      await page.getByRole('gridcell').filter({has:page.getByText('exif-sintetico.jpg',{exact:true})}).first().dblclick();
      await page.getByPlaceholder('Buscar en el texto…').fill('ABC123XYZ');
      await page.locator('[data-ocr-overlay] rect').first().waitFor();
      assert.ok(await page.locator('[data-ocr-overlay]').evaluate(svg=>{
        const image=svg.parentElement.querySelector('img');return Math.abs(image.naturalWidth/image.naturalHeight-1800/800)<.01;
      }),'Browser image and OCR agree on EXIF orientation');
      await page.screenshot({path:path.join(output,'exif-viewer-390.png')});
      let pdfResult;const pdfBegan=Date.now();
      do {pdfResult=(await request(`/content/files/${pdfFile.id}`)).data;if(pdfResult.state!=='done')await new Promise(resolve=>setTimeout(resolve,1000));}
      while(pdfResult.state!=='done'&&Date.now()-pdfBegan<90000);
      assert.equal(pdfResult.state,'done');
      await page.keyboard.press('Escape');
      await page.setViewportSize({width:1440,height:1000});
      await page.goto(`${ui}/app/m/runly.files/files?searchIn=all&q=escaneo-sintetico.pdf`);
      await page.getByRole('gridcell').filter({has:page.getByText('escaneo-sintetico.pdf',{exact:true})}).first().dblclick();
      await page.getByPlaceholder('Buscar en el texto…').fill('ABC123XYZ');
      await page.locator('[data-ocr-overlay] rect').first().waitFor();
      await page.getByRole('button',{name:'Rotar derecha',exact:true}).click();
      await page.waitForTimeout(500);
      assert.ok(await page.locator('[data-ocr-overlay]').evaluate(svg=>{
        const a=svg.getBoundingClientRect(),b=svg.parentElement.querySelector('canvas').getBoundingClientRect();
        return ['x','y','width','height'].every(key=>Math.abs(a[key]-b[key])<1);
      }),'PDF overlay shares rotated canvas dimensions');
      await page.screenshot({path:path.join(output,'pdf-rotated-1440.png')});
      await page.setViewportSize({width:390,height:1000});await page.waitForTimeout(500);
      await page.screenshot({path:path.join(output,'pdf-rotated-390.png')});
      await writeFile(path.join(output,'e2e-result.json'),JSON.stringify({fileId:file.id,state:result.state,ocr:true,pdf:true,exif:true,touch:true,keyboardFocus:true,zoomRotationGeometry:true,settingsPersisted:true,responsive:[1440,768,390,320]},null,2));
      if(process.env.CI_CONTENT_OFFLINE_QA==='1') {
        await page.setViewportSize({width:1440,height:1000});
        await page.goto(`${ui}/app/m/runly.core/settings`);
        for(const scope of ['instancia','empresa']) {
          const card=page.locator(`[aria-label="Procesamiento de ${scope}"]`);
          await card.getByRole('button',{name:'Perfil'}).click();
          await page.getByRole('option',{name:'Desactivado',exact:true}).click();
          const saved=page.waitForResponse(response=>response.request().method()==='PUT'&&response.url().endsWith(`/content/admin/${scope==='instancia'?'instance':'company'}`));
          await card.getByRole('button',{name:'Guardar política',exact:true}).click();
          assert.equal((await saved).status(),200);
        }
        assert.ok((await request(`/content/files/${file.id}`)).data.pages.length>0,'OFF preserves existing authorized text');
        await page.setViewportSize({width:390,height:1000});await page.waitForTimeout(400);
        await page.screenshot({path:path.join(output,'settings-off-390.png')});
      }
    } finally { await run('docker',['rm','-f',name]); }
    if(process.env.CI_CONTENT_OFFLINE_QA==='1') {
      const disconnectedAt=Date.now();
      while((await request('/content/admin/instance')).data.workers.some(worker=>worker.id==='browser-e2e'&&worker.connected)) {
        assert.ok(Date.now()-disconnectedAt<120000,'Heartbeat expiry exceeded expected interval');
        await new Promise(resolve=>setTimeout(resolve,5000));
      }
      await page.reload();
      await page.locator('[aria-label="Procesamiento de instancia"]').getByText('Worker desconectado',{exact:true}).waitFor();
      await page.screenshot({path:path.join(output,'settings-disconnected-390.png')});
    }
  }
  console.log(JSON.stringify({login:true,settings:true,responsive:[1440,768,390,320]}));
} catch(error) {
  await page.screenshot({path:path.join(output,'failure.png')});
  console.error(JSON.stringify({path:new URL(page.url()).pathname,body:(await page.locator('body').innerText()).slice(0,1500)}));
  throw error;
} finally { await browser.close(); }
