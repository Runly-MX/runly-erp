import https from 'node:https'
import net from 'node:net'
import {readFileSync}from'node:fs'
let retries=0
const server=https.createServer({key:readFileSync('/fixture/key.pem'),cert:readFileSync('/fixture/cert.pem')},(req,res)=>{
  const url=new URL(req.url,'https://api.iconify.design')
  const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data))}
  if(url.pathname==='/redirect')return json({},302)&&undefined
  if(url.pathname==='/malicious'){res.writeHead(302,{Location:'https://127.0.0.1/private'});return res.end()}
  if(url.pathname==='/slow-headers'){const timer=setTimeout(()=>json({ok:true}),500);res.on('close',()=>clearTimeout(timer));return}
  if(url.pathname==='/slow-body'){res.writeHead(200,{'Content-Type':'application/json'});res.write('{');const timer=setTimeout(()=>res.end('}'),500);res.on('close',()=>clearTimeout(timer));return}
  if(url.pathname==='/huge'){res.writeHead(200,{'Content-Type':'image/png','Content-Length':'10485761'});return res.end()}
  if(url.pathname==='/status/429')return json({},429)
  if(url.pathname==='/status/502')return json({},502)
  if(url.pathname==='/status/504')return json({},504)
  if(url.pathname==='/collections')return json({tabler:{license:{spdx:'MIT'}}})
  if(url.pathname==='/search'){
    if(url.searchParams.get('query')==='intermittent'&&retries++===0)return json({},502)
    if(url.searchParams.get('query')==='malformed'){res.writeHead(200,{'Content-Type':'application/json'});return res.end('not-json')}
    return json({icons:['tabler:star']})
  }
  return json({ok:true})
})
server.listen(4443,'0.0.0.0',()=>console.log('CATALOG_TLS_READY'))
net.createServer(socket=>{socket.on('error',()=>{});socket.on('data',()=>{})}).listen(4444,'0.0.0.0')
