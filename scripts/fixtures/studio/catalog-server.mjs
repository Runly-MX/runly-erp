// Deterministic public-provider simulator, reachable only on the disposable Docker network.
// Synthetic data only. The Pixabay key below is a fake that exists nowhere; query words trigger failures:
//   rate-limit -> 429, offline -> 503, gateway -> 504, stall -> never answers, malformed -> unexpected JSON.
import {createServer} from 'node:http'
import {createRequire} from 'node:module'
const sharp=createRequire(new URL('./apps/api/package.json',import.meta.url))('sharp')
const png=await sharp({create:{width:320,height:240,channels:3,background:'#e879f9'}}).png().toBuffer()
const id='00000000-0000-4000-8000-000000000010'
const FAKE_PIXABAY_KEY='e2e-fake-key-not-real'
const photo={id,title:'Fotografía sintética violeta',creator:'Estudio de pruebas',license:'by',license_version:'4.0',license_url:'https://creativecommons.org/licenses/by/4.0/',
  foreign_landing_url:'https://example.com/synthetic-photo',url:'https://upload.wikimedia.org/fixture/photo.png',thumbnail:'https://upload.wikimedia.org/fixture/thumb.png',width:320,height:240}
const commons=(pageid,name,license,{mime='image/png',url='https://upload.wikimedia.org/fixture/photo.png',artist='<a href="//commons.wikimedia.org/wiki/User:Eva">Eva &amp; Co</a>',licenseUrl}={})=>({pageid,title:`File:${name}.png`,index:pageid,imageinfo:[{
  url,thumburl:'https://thumb.wikimedia.org/fixture/thumb.png',width:320,height:240,mime,descriptionurl:`https://commons.wikimedia.org/wiki/File:${name}.png`,
  extmetadata:{LicenseShortName:{value:license},LicenseUrl:{value:licenseUrl??''},Artist:{value:artist},ObjectName:{value:name},Copyrighted:{value:license==='Public domain'?'False':'True'}}}]})
const PAGES=[commons(77,'Arbol CC BY','CC BY 4.0',{licenseUrl:'https://creativecommons.org/licenses/by/4.0'}),commons(78,'Arbol SA','CC BY-SA 4.0',{licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0'}),
  commons(79,'Arbol CC0','CC0'),commons(80,'Arbol SVG','CC BY 4.0',{mime:'image/svg+xml',licenseUrl:'https://creativecommons.org/licenses/by/4.0'}),
  commons(81,'Arbol redirigido','CC BY 3.0',{url:'https://upload.wikimedia.org/redirect/photo.png',licenseUrl:'https://creativecommons.org/licenses/by/3.0'}),
  commons(82,'Arbol dominio publico','Public domain'),commons(83,'Arbol redireccion hostil','CC BY 2.0',{url:'https://upload.wikimedia.org/redirect/evil.png',licenseUrl:'https://creativecommons.org/licenses/by/2.0'})]
const hit=(n,extra={})=>({id:n,pageURL:`https://pixabay.com/photos/synthetic-${n}/`,tags:'perro, mascota, animal',user:'Autor Pixabay',imageWidth:320,imageHeight:240,
  largeImageURL:'https://cdn.pixabay.com/photo/large.png',webformatURL:'https://cdn.pixabay.com/photo/web.png',...extra})
const stats={}
createServer((req,res)=>{
  const url=new URL(req.url,'http://fixture.test'),host=req.headers['x-catalog-host']
  if(url.pathname==='/__stats')return res.writeHead(200,{'Content-Type':'application/json'}).end(JSON.stringify(stats))
  if(url.pathname==='/__reset'){for(const key of Object.keys(stats))delete stats[key];return res.writeHead(204).end()}
  stats[host]=(stats[host]??0)+1
  const q=url.searchParams.get('query')??url.searchParams.get('q')??url.searchParams.get('gsrsearch')??''
  const json=(data,status=200,headers={})=>{res.writeHead(status,{'Content-Type':'application/json',...headers});res.end(JSON.stringify(data))}
  const word=['rate-limit','offline','gateway','stall','malformed'].find(name=>q.includes(name))
  if(word==='stall')return // never answers: the client must give up on its own
  if(word==='rate-limit')return json({error:'Limited'},429,{'Retry-After':'60','X-RateLimit-Remaining':'0'})
  if(word==='offline')return json({error:'Unavailable'},503)
  if(word==='gateway')return json({error:'Gateway timeout'},504)
  if(word==='malformed')return json({unexpected:true})
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
  if(host==='commons.wikimedia.org'&&url.pathname==='/w/api.php') {
    if(!/^RunlyStudio\//.test(req.headers['x-catalog-user-agent']??'RunlyStudio/'))return json({error:'anonymous clients must identify themselves'},403)
    const ids=url.searchParams.get('pageids')
    if(ids)return json({batchcomplete:true,query:{pages:PAGES.filter(page=>String(page.pageid)===ids)}})
    const offset=Number(url.searchParams.get('gsroffset')||0)
    return json({batchcomplete:true,...(offset===0?{continue:{gsroffset:20,continue:'gsroffset||'}}:{}),query:{pages:offset===0?PAGES:[]}})
  }
  if(host==='pixabay.com'&&url.pathname==='/api/') {
    if(url.searchParams.get('key')!==FAKE_PIXABAY_KEY)return res.writeHead(400,{'Content-Type':'text/plain'}).end('[ERROR 400] Invalid or missing API key')
    const only=url.searchParams.get('id')
    const hits=[hit(4242),hit(4243,{tags:'gato, mascota'}),hit(9,{pageURL:'http://pixabay.com/not-https'}),hit(10,{largeImageURL:'https://evil.example/large.png'})]
    return json({total:45,totalHits:45,hits:only?hits.filter(row=>String(row.id)===only):hits},200,{'X-RateLimit-Limit':'100','X-RateLimit-Remaining':'99'})
  }
  const image=(status=200)=>{res.writeHead(status,{'Content-Type':'image/png','Content-Length':png.length});res.end(png)}
  if(host==='upload.wikimedia.org') {
    if(url.pathname==='/redirect/photo.png'){res.writeHead(302,{Location:'/fixture/photo.png'});return res.end()}
    if(url.pathname==='/redirect/evil.png'){res.writeHead(302,{Location:'https://evil.example/x.png'});return res.end()}
    if(['/fixture/photo.png','/fixture/thumb.png'].includes(url.pathname))return image()
  }
  if(host==='thumb.wikimedia.org'&&url.pathname==='/fixture/thumb.png')return image()
  if(host==='cdn.pixabay.com'&&['/photo/large.png','/photo/web.png'].includes(url.pathname))return image()
  json({},404)
}).listen(9080,'0.0.0.0',()=>console.log('Local Studio provider fixtures ready'))
