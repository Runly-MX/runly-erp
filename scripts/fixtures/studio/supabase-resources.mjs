import {waitForSynced} from './editor-controls.mjs'
import {openPanel,layer,selectLayer,insertText,insertShape,showFiles,createBlank,exportImage,shareDialog,properties} from './editor-controls.mjs'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { chromium } from 'playwright'
const sharp = createRequire(new URL('../../../apps/api/package.json', import.meta.url))('sharp')

export async function verifyStudioResources(stack, { users, companies }) {
  const [owner,denied,peer,foreign]=users,[a,b]=companies
  const tokens=await Promise.all([owner,denied,peer,foreign].map(async user=>{
    const response=await fetch(`${stack.urls.api}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({identifier:user.email,password:user.password})})
    assert.equal(response.status,200);return(await response.json()).data.access_token
  }))
  const headers=(index=0,company=a.id)=>({'X-Runly-Studio-Protocol':'3',Authorization:`Bearer ${tokens[index]}`,'X-Runly-Company-Id':company})
  const get=(path,index=0,company=a.id)=>fetch(`${stack.urls.api}${path}`,{headers:headers(index,company)})
  const original=await sharp({create:{width:1200,height:800,channels:4,background:'#16a34a'}}).png().toBuffer()
  async function upload(name,shared=false){
    const form=new FormData();form.append('file',new Blob([original],{type:'image/png'}),name)
    form.append('moduleKey','runly.files');form.append('entityType','AtlasFile');if(shared)form.append('shareWithCompany','true')
    const response=await fetch(`${stack.urls.api}/files/upload`,{method:'POST',headers:headers(),body:form})
    assert.equal(response.status,201);return(await response.json()).data
  }
  const privateAsset=await upload('library-private.png'),shared=await upload('library-company.png',true),path='/studio/resources'
  const listing=await get(`${path}?q=library-&workspace=company&format=png&page=1`)
  assert.equal(listing.status,200)
  const listed=(await listing.json()).data
  assert.equal(listed.pagination.pageSize,24);assert.ok(listed.data.some(row=>row.id===privateAsset.id))
  assert.ok(listed.data.every(row=>!('objectKey'in row)&&!('signedUrl'in row)))
  assert.equal((await(await get(`${path}?q=library-&format=jpg`)).json()).data.data.length,0)
  const peerList=(await(await get(`${path}?q=library-&workspace=company`,2)).json()).data.data
  assert.ok(peerList.some(row=>row.id===shared.id));assert.ok(!peerList.some(row=>row.id===privateAsset.id))
  assert.equal((await get(`${path}/${privateAsset.id}/thumbnail`,2)).status,404)
  assert.equal((await get(`${path}/${shared.id}/thumbnail`,3,b.id)).status,404)
  assert.equal((await get(path,1)).status,403)
  const thumbnail=await get(`${path}/${shared.id}/thumbnail`,2)
  assert.equal(thumbnail.status,200);assert.match(thumbnail.headers.get('cache-control'),/no-store/)
  const metadata=await sharp(Buffer.from(await thumbnail.arrayBuffer())).metadata()
  assert.equal(metadata.width,256);assert.ok(metadata.height<=256)
  assert.equal((await get(`${path}/${shared.id}/thumbnail`,2)).status,200)
  await stack.pool.query("DELETE FROM role_permission WHERE role_id=$1 AND permission_id=(SELECT id FROM permission WHERE key='files.assets.read')",[a.roleId])
  assert.equal((await get(`${path}/${shared.id}/thumbnail`,2)).status,403)
  await stack.pool.query("INSERT INTO role_permission(id,role_id,permission_id) SELECT uuidv7(),$1,id FROM permission WHERE key='files.assets.read'",[a.roleId])
  await stack.pool.query('UPDATE file_asset SET enabled=false WHERE id=$1',[shared.id])
  assert.equal((await get(`${path}/${shared.id}/thumbnail`,2)).status,404)
  await stack.pool.query('UPDATE file_asset SET enabled=true WHERE id=$1',[shared.id])
  const browser=await chromium.launch({channel:'chrome',headless:true})
  try{
    const page=await browser.newPage({viewport:{width:1500,height:1100}})
    await page.goto(`${stack.urls.web}/app/login`)
    await page.locator('#identifier').fill(owner.email);await page.locator('#password').fill(owner.password)
    await page.getByRole('button',{name:'Acceder al sistema',exact:true}).click();await page.waitForURL(url=>!url.pathname.includes('/login'))
    await page.goto(`${stack.urls.web}/app/m/runly.studio/`);await createBlank(page)
    await showFiles(page)
    await page.getByLabel('Buscar imágenes por nombre').fill('library-private')
    const designId=new URL(page.url()).searchParams.get('design'),card=page.getByRole('button',{name:'Insertar library-private.png',exact:true})
    await card.waitFor();await card.locator('img').waitFor()
    const before=(await stack.pool.query('SELECT count(*) FROM file_asset')).rows[0].count
    await card.click()
    await selectLayer(page,1);await waitForSynced(page)
    const record=(await(await get(`/studio/designs/${designId}`)).json()).data
    assert.equal(record.document.objects[0].fileAssetId,privateAsset.id)
    assert.equal((await stack.pool.query('SELECT count(*) FROM file_asset')).rows[0].count,before)
    assert.ok(!JSON.stringify(record.document).includes('signedUrl'))
    const download=page.waitForEvent('download');await exportImage(page)
    await(await download).saveAs(join(stack.directory,'resources-export.png'))
    assert.equal((await sharp(join(stack.directory,'resources-export.png')).metadata()).width,record.document.page.width)
    await page.screenshot({path:join(stack.directory,'resources-panel.png'),fullPage:true})
    const signed=(await(await get(`/files/${privateAsset.id}/signed-url`)).json()).data
    assert.deepEqual(Buffer.from(await(await fetch(signed.signedUrl)).arrayBuffer()),original)
    await selectLayer(page,1)
    await page.getByRole('button',{name:'Copiar',exact:true}).click()
    await page.getByRole('button',{name:'Volver a mis diseños',exact:true}).click()
    await createBlank(page)
    await page.getByRole('button',{name:'Pegar',exact:true}).click()
    await openPanel(page,'Capas')
    await layer(page,1).waitFor()
    await page.getByRole('button',{name:'Deshacer (Ctrl+Z)',exact:true}).click()
    await layer(page,1).waitFor({state:'detached'})
    await page.getByRole('button',{name:'Rehacer (Ctrl+Y)',exact:true}).click()
    await layer(page,1).waitFor()
    await waitForSynced(page)
    const copied=(await(await get(`/studio/designs/${new URL(page.url()).searchParams.get('design')}`)).json()).data
    assert.notEqual(copied.document.objects[0].id,record.document.objects[0].id)
    assert.equal(copied.document.objects[0].fileAssetId,privateAsset.id)
    assert.ok(!JSON.stringify(copied.document).includes('token='))
    await page.getByRole('button',{name:'Volver a mis diseños',exact:true}).click()
    await createBlank(page)
    await stack.pool.query('UPDATE file_asset SET enabled=false WHERE id=$1',[privateAsset.id])
    await page.getByRole('button',{name:'Pegar',exact:true}).click()
    await page.getByText('No se pudo completar la operación',{exact:true}).waitFor()
    await openPanel(page,'Capas')
    assert.equal(await layer(page,1).count(),0)
    await stack.pool.query('UPDATE file_asset SET enabled=true WHERE id=$1',[privateAsset.id])
    return{passed:true,interceptors:0,checks:['Files visibility, permissions, company isolation; cache reauthorizes after permission revocation and disabling','24-item pagination, MIME filter, no signed URLs in catalog; 256px thumbnails','actual Resources search, lazy preview, reuse existing ID, save and full-size PNG; no extra FileAsset or original mutation','clipboard between designs: fresh object ID, same authorized FileAsset, undo/redo, persisted canonical JSON; disabled image paste rejected atomically']}
  }finally{await browser.close()}
}
