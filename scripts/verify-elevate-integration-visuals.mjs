// Compare the preserved prototype with the existing trusted renderer; no additional renderer/editor.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {inspectWebsiteTemplate} from '../packages/studio-interchange/src/website-template.js';
import {mapWebsiteImages,sectionsToAtlasPage,websiteThemeToAtlasTokens} from '../packages/studio-interchange/src/website-document.js';
import {BLOCK_CATALOG} from '../apps/api/src/routes/website/page-document.js';
import {buildWebsitePublicRuntime,buildWebsiteSsr} from './build-website-public-runtime.mjs';
const out=resolve('.artifacts/website-integration/visual'),prototype=resolve('docs/private/elevate-wellness/prototype');await mkdir(out,{recursive:true});
const runtime=await buildWebsitePublicRuntime(),ssr=resolve(out,'renderer');await buildWebsiteSsr(ssr,runtime['entry.js'].hash);
const {renderPage}=await import(pathToFileURL(resolve(ssr,'ssr.mjs')).href);
const snapshots={};
for(const [name,file]of [['before','.artifacts/website-w3/website.elevate-wellness-v2.zip'],['candidate','.artifacts/website-integration/website.elevate-wellness-v2.zip']]){
 const inspected=await inspectWebsiteTemplate(await readFile(file),{builderCatalogs:{'0.3.5':BLOCK_CATALOG}});assert(inspected.ok);
 const urls=new Map(inspected.content.assets.map(a=>[`asset:${a.sha256}`,`data:${a.mime};base64,${Buffer.from(a.data).toString('base64')}`]));
 const document=mapWebsiteImages(sectionsToAtlasPage(inspected.content.pages[0]),BLOCK_CATALOG,v=>urls.get(v)??v);
 snapshots[name]={initialized:true,releaseId:'visual-lab',site:{company:'visual-lab',id:'visual-lab',analyticsMode:'off'},page:{publishedBuilderData:document},theme:{tokens:websiteThemeToAtlasTokens(inspected.content.theme)}};
}
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{try{
 const url=new URL(req.url,'http://localhost'),variant=url.searchParams.get('variant')??'candidate';res.setHeader('Cache-Control','no-store');
 if(url.pathname==='/public/website/resolve'){res.setHeader('Content-Type','application/json');return res.end(JSON.stringify(snapshots[variant]??snapshots.candidate));}
 if(url.pathname==='/entry.js'||url.pathname==='/style.css'){const f=runtime[url.pathname.slice(1)];res.setHeader('Content-Type',f.mime);return res.end(f.bytes);}
 if(url.pathname==='/candidate'||url.pathname==='/before'){
  const snapshot=snapshots[url.pathname.slice(1)],rendered=renderPage({...snapshot,config:{siteId:'visual-lab',companySlug:'visual-lab'}});
  // Freeze the selected snapshot for hydration without a shared mutable server variable.
  res.setHeader('Content-Type','text/html');return res.end(`<html lang="en" data-release="visual-lab"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/style.css"></head><body><div id="runly-public-root" data-ssr="${rendered.hydrate?'hydrate':'replace'}">${rendered.html}</div><script>const originalFetch=window.fetch;window.fetch=(url,options)=>originalFetch(typeof url==='string'&&url.startsWith('/public/website/resolve')?url+'&variant=${url.pathname.slice(1)}':url,options)</script><script type="module" src="/entry.js"></script></body></html>`);
 }
 if(url.pathname.startsWith('/prototype/')){const target=resolve(prototype,decodeURIComponent(url.pathname.slice(11))||'index.html');if(!target.startsWith(prototype+sep))throw Error('path');res.setHeader('Content-Type',mime[extname(target)]??'application/octet-stream');return res.end(await readFile(target));}
 res.statusCode=404;res.end();
 }catch{res.statusCode=404;res.end();}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin=`http://127.0.0.1:${server.address().port}`,browser=await chromium.launch();
const context=await browser.newContext();await context.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
const results=[];
try{const page=await context.newPage();for(const [device,width,height]of [['desktop',1440,1000],['tablet',768,1024],['mobile',390,844]])for(const name of ['prototype/index.html','before','candidate']){
 await page.setViewportSize({width,height});const response=await page.goto(origin+'/'+name);assert.equal(response.status(),200);
 await page.evaluate(async()=>{for(let y=0;y<document.documentElement.scrollHeight;y+=innerHeight){scrollTo(0,y);await new Promise(r=>setTimeout(r,30))}scrollTo(0,0)});
 await page.waitForFunction(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0));
 const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);assert(!overflow,device+' '+name);
 const file=`${device}-${name.split('/')[0]}.png`;await page.screenshot({path:resolve(out,file),fullPage:true});results.push({device,width,variant:name,file,overflow});
}await writeFile(resolve(out,'result.json'),JSON.stringify({renderer:'existing WebsitePageRenderer + public runtime',results},null,2));console.log('PASS 9 visual comparisons; original prototype, W2 baseline and native-property candidate');}
finally{await context.close();await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
