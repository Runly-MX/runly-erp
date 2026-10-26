// Deterministic public-provider simulator, reachable only on the disposable Docker network.
import {createServer} from 'node:http'
import {createRequire} from 'node:module'
const sharp=createRequire(new URL('./apps/api/package.json',import.meta.url))('sharp')
const png=await sharp({create:{width:320,height:240,channels:3,background:'#e879f9'}}).png().toBuffer()
const id='00000000-0000-4000-8000-000000000010'
const photo={id,title:'Fotografía sintética violeta',creator:'Estudio de pruebas',license:'by',license_version:'4.0',license_url:'https://creativecommons.org/licenses/by/4.0/',
  foreign_landing_url:'https://example.com/synthetic-photo',url:'https://upload.wikimedia.org/fixture/photo.png',thumbnail:'https://upload.wikimedia.org/fixture/thumb.png',width:320,height:240}
createServer((req,res)=>{
  const url=new URL(req.url,'http://fixture.test'),host=req.headers['x-catalog-host'],q=url.searchParams.get('query')??url.searchParams.get('q')??''
  const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data))}
  if(q==='rate-limit')return json({error:'Limited'},429)
  if(q==='offline')return json({error:'Unavailable'},503)
  if(q==='malformed')return json({unexpected:true})
  if(host==='api.iconify.design') {
    if(url.pathname==='/collections')return json({tabler:{license:{spdx:'MIT'}},lucide:{license:{spdx:'ISC'}}})
    if(url.pathname==='/search')return json({icons:[`${url.searchParams.get('prefix')??'tabler'}:star`],limit:32,start:0,total:1})
    const prefix=url.pathname==='/lucide.json'?'lucide':'tabler'
    if(!['/tabler.json','/lucide.json'].includes(url.pathname))return json({},404)
    return json({prefix,width:24,height:24,icons:{star:{body:'<path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 2L15 9L22 9L17 14L19 22L12 18L5 22L7 14L2 9L9 9Z"/>'}}})
  }
  if(host==='api.openverse.org') {
    if(url.pathname==='/v1/images/')return json({page_count:2,results:[photo,{...photo,id:'00000000-0000-4000-8000-000000000011',license:'by-nc'}]})
    if(url.pathname===`/v1/images/${id}/`)return json(photo)
    return json({},404)
  }
  if(host==='upload.wikimedia.org'&&['/fixture/photo.png','/fixture/thumb.png'].includes(url.pathname)) {res.writeHead(200,{'Content-Type':'image/png','Content-Length':png.length});return res.end(png)}
  json({},404)
}).listen(9080,'0.0.0.0',()=>console.log('Local Studio provider fixtures ready'))
