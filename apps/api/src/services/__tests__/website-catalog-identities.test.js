import test from 'node:test'
import assert from 'node:assert/strict'
import {createRequire} from 'node:module'
import {WEBSITE_BUILDER_CATALOGS as catalogs, WEBSITE_BUILDER_CATALOG_IDENTITIES as identities} from '../../routes/website/builder-catalogs.js'
import {catalogDigest,inspectWebsiteTemplate,resolveWebsiteCatalog} from '@runly/studio-interchange/website-template'
import {exportWebsiteTemplate} from '@runly/studio-interchange/website-write'
import {sectionsToAtlasPage,atlasPageToSections} from '@runly/studio-interchange/website-document'

const options={builderCatalogs:catalogs,builderCatalogIdentities:identities}
test('API, desktop y Website Blocks declaran y resuelven Atlas 0.9.1',()=>{
  for(const manifest of ['../../../package.json','../../../../desktop/package.json','../../../../../packages/website-blocks/package.json']){
    const require=createRequire(new URL(manifest,import.meta.url))
    assert.equal(require('./package.json').dependencies['@raulbellosom/atlas-web-builder'],'0.9.1')
    assert.equal(require('@raulbellosom/atlas-web-builder/package.json').version,'0.9.1')
  }
})
for(const [label,version,catalog] of [
  ['Hub histórico','0.8.2',identities['0.8.2']['2d7c84c46d74164981abb6028d6d278f5a9774a9eef32fb86a639cbe18c5d318']],
  ['ERP histórico','0.8.2',identities['0.8.2']['cdb67dabfee8e546f4fb453935ac7a791bebba294ace9035e3159e3fb84126d1']],
  ['Atlas publicado','0.9.0',catalogs['0.9.0']],
  ['Atlas SVG publicado','0.9.1',catalogs['0.9.1']],
  ['ERP SVG con Ticketing','0.9.1',identities['0.9.1']['2e6570493f7016886277a35c1567a5acc5f97daf5ae6cc34d4f0b2a7698c36ca']],
  ['ERP con Ticketing','0.9.0',identities['0.9.0']['bf50cd9eb4aeb731c2f35e21af7603f303f9c5c8626b4542b9594ea5f9bb8da1']],
])test(`${label}: apertura, edición, validación y reapertura conservan identidad y campos`,async()=>{
  const digest=catalogDigest(catalog)
  const sections=[{type:'TextElementBlock',props:{text:'Documento histórico',fontSize:48,...(version==='0.9.0'?{mobileFontSize:28,mobilePaddingLeft:0,mobileVisibility:'collapsed'}:{})}}]
  if(version==='0.9.1')sections.push({type:'ImageBlock',props:{src:'',vector:true,tint:'primary'}})
  if(catalog.blocks.some(b=>b.type==='BookingPortalBlock'))sections.push({type:'BookingPortalBlock',props:{bookingPage:'/reservar',display:'button',buttonLabel:'Reservar'}})
  if(catalog.blocks.some(b=>b.type==='TicketingEventBlock'))sections.push({type:'TicketingEventBlock',props:{event:'evento-de-prueba',display:'button',buttonLabel:'Obtener boletos'}})
  const page={path:'/',title:'Inicio',isHome:true,sections}
  const original=await exportWebsiteTemplate({title:'Identidad',builderVersion:version,catalog,pages:[page]})
  const opened=await inspectWebsiteTemplate(original.bytes,options)
  assert.equal(opened.ok,true,JSON.stringify(opened.errors))
  assert.equal(opened.manifest.builder.catalogDigest,digest)
  const document=sectionsToAtlasPage(opened.content.pages[0])
  Object.values(document.blocks).find(b=>b.type==='TextElementBlock').props.text='Edición conservada'
  const {sections:editedSections}=atlasPageToSections(document)
  const edited=await exportWebsiteTemplate({title:'Identidad',builderVersion:version,catalog,pages:[{...page,sections:editedSections}]})
  const reopened=await inspectWebsiteTemplate(edited.bytes,options)
  assert.equal(reopened.ok,true,JSON.stringify(reopened.errors))
  assert.equal(reopened.manifest.builder.min,version)
  assert.equal(reopened.manifest.builder.catalogDigest,digest)
  assert.deepEqual(reopened.content.pages[0].sections,editedSections)
  assert.equal(resolveWebsiteCatalog(catalogs,identities,version,'0'.repeat(64)),null)
  assert.equal(resolveWebsiteCatalog(catalogs,identities,'0.9.0',catalogDigest(identities['0.8.2'][Object.keys(identities['0.8.2'])[0]])),null)
})

test('Atlas SVG registra vector y tint sin modificar el catálogo anterior',()=>{
  const image=catalogs['0.9.1'].blocks.find(b=>b.type==='ImageBlock')
  assert.equal(image.fields.vector.type,'toggle')
  assert.ok(image.fields.tint.options.includes('primary'))
  assert.equal(catalogs['0.9.0'].blocks.find(b=>b.type==='ImageBlock').fields.vector,undefined)
  assert.equal(catalogs['0.9.0'].blocks.find(b=>b.type==='ImageBlock').fields.tint,undefined)
})

test('identidades históricas son exactas y los snapshots no dependen del catálogo actual',()=>{
  for(const variants of Object.values(identities))for(const [digest,catalog] of Object.entries(variants))assert.equal(catalogDigest(catalog),digest)
  assert.equal(catalogs['0.8.2'].blocks.length,157)
  assert.equal(catalogs['0.9.0'].blocks.length,157)
  const extended=identities['0.9.0']['bf50cd9eb4aeb731c2f35e21af7603f303f9c5c8626b4542b9594ea5f9bb8da1']
  assert.equal(extended.blocks.length,158)
  assert.deepEqual(extended.blocks.filter(b=>b.type!=='TicketingEventBlock'),catalogs['0.9.0'].blocks)
  assert.equal(resolveWebsiteCatalog(catalogs,identities,'0.8.2',catalogDigest(extended)),null)
  const digest=Object.keys(identities['0.8.2'])[0],forged=structuredClone(identities)
  forged['0.8.2'][digest].blocks[0].label='Alterado'
  assert.equal(resolveWebsiteCatalog({},forged,'0.8.2',digest),null)
})
