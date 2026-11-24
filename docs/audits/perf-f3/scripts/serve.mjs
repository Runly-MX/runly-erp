// Prod-like static server: mirrors nginx (index no-store, assets no Cache-Control), optional gzip, same-origin API proxy.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import zlib from 'node:zlib'; import net from 'node:net';
const [,, dist0, port='4173', api='4021', gz='1'] = process.argv; const dist=path.resolve(dist0);
const T={'.js':'text/javascript','.mjs':'text/javascript','.css':'text/css','.html':'text/html','.json':'application/json','.png':'image/png','.svg':'image/svg+xml','.ico':'image/x-icon','.woff2':'font/woff2','.wasm':'application/wasm','.webmanifest':'application/manifest+json'};
const API=/^\/(public|modules|blueprints|files|contacts|company|identity|finance|hr|website|ledger|calendar|projects|catalog|pos|storefront|activity|notifications|inventory|chat|calls|auth|health|pwa|mcp|setup|profile|realtime|runtime|collaboration|help|ai|canvas|notes|lms|bookings|ticketing|attendance|growth|purchases|fleet|studio|automations|search|me|users|upload|storage|tenants|marketplace|audit|backups|sites)(?:\/|$)/;
const apiPath=(u)=>{ if(u.startsWith("/app")) return false; const f=path.join(dist,decodeURIComponent(u)); return !(f.startsWith(dist)&&fs.existsSync(f)&&fs.statSync(f).isFile()); };
const srv=http.createServer((req,res)=>{
  const u=req.url.split('?')[0];
  if(u==='/runtime-config.js'){res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});return res.end(`window.__RUNLY_RUNTIME_CONFIG__={RUNLY_API_URL:"http://localhost:${port}"};`)}
  if(apiPath(u)){const p=http.request({host:'127.0.0.1',port:api,path:req.url,method:req.method,headers:req.headers},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res)});p.on('error',()=>{res.writeHead(502);res.end()});return req.pipe(p)}
  let rel=u.replace(/^\/app\//,'/'); let f=path.join(dist,decodeURIComponent(rel)); let spa=false;
  if(!f.startsWith(dist)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){f=path.join(dist,'index.html');spa=true}
  const ext=path.extname(f); const body=fs.readFileSync(f); const h={'content-type':T[ext]||'application/octet-stream'};
  if(spa||f.endsWith('index.html')) h['cache-control']='no-store';
  else h['last-modified']=fs.statSync(f).mtime.toUTCString();
  if(gz==='1'&&/\.(js|css|html|json|svg|mjs)$/.test(f)&&String(req.headers['accept-encoding']).includes('gzip')){const z=zlib.gzipSync(body,{level:6});h['content-encoding']='gzip';h['content-length']=z.length;res.writeHead(200,h);return res.end(z)}
  h['content-length']=body.length;res.writeHead(200,h);res.end(body)});
srv.on('upgrade',(req,sock,head)=>{const s=net.connect(api,'127.0.0.1',()=>{s.write(`${req.method} ${req.url} HTTP/1.1\r\n`+Object.entries(req.headers).map(([k,v])=>`${k}: ${v}`).join('\r\n')+'\r\n\r\n');s.write(head);s.pipe(sock);sock.pipe(s)});s.on('error',()=>sock.destroy())});
srv.listen(port,()=>console.log('serving',dist,port));
