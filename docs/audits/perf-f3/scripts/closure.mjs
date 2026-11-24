import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib';
const dist = process.argv[2]; const man = JSON.parse(fs.readFileSync(path.join(dist,'.vite/manifest.json'),'utf8'));
const gz = new Map(); const sz = f => { if(!gz.has(f)){const b=fs.readFileSync(path.join(dist,f)); gz.set(f,{raw:b.length,gz:zlib.gzipSync(b,{level:9}).length});} return gz.get(f); };
const byFile = Object.fromEntries(Object.entries(man).map(([k,v])=>[v.file,{key:k,...v}]));
function closure(key, {dyn=false}={}) { const seen=new Set(), css=new Set(); (function walk(k){ if(seen.has(k))return; seen.add(k); const m=man[k]; (m.css||[]).forEach(c=>css.add(c)); (m.imports||[]).forEach(walk); if(dyn)(m.dynamicImports||[]).forEach(walk);})(key); return {chunks:[...seen].map(k=>man[k].file), css:[...css]}; }
function tot(files){ let r=0,g=0; for(const f of files){const s=sz(f); r+=s.raw; g+=s.gz;} return {n:files.length,raw:r,gz:g}; }
const out = {};
const entry = Object.keys(man).find(k=>man[k].isEntry && man[k].src==='index.html');
const pre = closure(entry); out.preLogin = {js:tot(pre.chunks), css:tot(pre.css), files:pre.chunks.map(f=>({f,...sz(f)}))};
const appKey = Object.keys(man).find(k=>/AppEntry\.jsx$/.test(k)); const app = closure(appKey);
const appOnly = app.chunks.filter(f=>!pre.chunks.includes(f));
out.appEntry = {js:tot(app.chunks), css:tot(app.css), addOverPre:tot(appOnly), files:app.chunks.map(f=>({f,...sz(f),name:byFile[f]?.name,inPre:pre.chunks.includes(f)})).sort((a,b)=>b.gz-a.gz)};
// all chunks
const all = fs.readdirSync(path.join(dist,'assets')).filter(f=>f.endsWith('.js')).map(f=>'assets/'+f);
out.allJs = tot(all); out.allCss = tot(fs.readdirSync(path.join(dist,'assets')).filter(f=>f.endsWith('.css')).map(f=>'assets/'+f));
// per dynamic entry: incremental cost over appEntry closure
const base = new Set([...app.chunks]);
out.dynamic = [];
for (const [k,v] of Object.entries(man)) { if(!v.isDynamicEntry) continue; const c=closure(k); const inc=c.chunks.filter(f=>!base.has(f)); const t=tot(inc); out.dynamic.push({key:k,file:v.file,incN:t.n,incRaw:t.raw,incGz:t.gz}); }
out.dynamic.sort((a,b)=>b.incGz-a.incGz);
// preload hints in index.html
out.html = fs.readFileSync(path.join(dist,'index.html'),'utf8').match(/<(link|script)[^>]+>/g);
fs.writeFileSync(process.argv[3], JSON.stringify(out,null,1));
const k=x=>(x/1024).toFixed(0)+'KB';
console.log('PRE js',out.preLogin.js.n,k(out.preLogin.js.raw),k(out.preLogin.js.gz),'css',k(out.preLogin.css.gz));
console.log('APP js',out.appEntry.js.n,k(out.appEntry.js.raw),k(out.appEntry.js.gz),'css',k(out.appEntry.css.raw),k(out.appEntry.css.gz),'add over pre',k(out.appEntry.addOverPre.gz));
console.log('ALL js',out.allJs.n,k(out.allJs.raw),k(out.allJs.gz),'css',k(out.allCss.raw), k(out.allCss.gz));
