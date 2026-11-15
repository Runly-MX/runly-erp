import test from 'node:test'
import assert from 'node:assert/strict'
import {readFileSync} from 'node:fs'
import {WEBSITE_BUILDER_CATALOGS as catalogs} from '../../routes/website/builder-catalogs.js'
import {sectionsToDocument,documentToSections} from '../../routes/website/page-document.js'
import {normalizeWebsiteDocument} from '../website-draft-service.js'
import {exportWebsiteTemplate} from '@runly/studio-interchange/website-write'
import {inspectWebsiteTemplate,catalogDigest} from '@runly/studio-interchange/website-template'

test('Atlas catalogs preserve old ZIPs and round-trip free responsive elements through ERP validation',async()=>{
  assert.equal(catalogDigest(catalogs['0.3.5']),'0e6f77787d7351448f05dc87af8b1f2bb701170a1077eacc76633d548216d248')
  assert.ok(!catalogs['0.3.5'].blocks.some(b=>b.type==='BoxBlock'))
  const hub=JSON.parse(readFileSync(new URL('../../../../../../runly-developer-hub/packages/contracts/website-builder-catalogs/0.6.0.json',import.meta.url)))
  assert.equal(catalogDigest(catalogs['0.6.0']),catalogDigest(hub))
  assert.equal(catalogDigest(catalogs['0.6.1']),'49bd05df8c974119eb526c5c4dce1209bc022ed02d323563f5fdf88b5d5780a1')
  for(const builderVersion of ['0.3.5','0.6.0','0.6.1','0.6.2']){
    const catalog=catalogs[builderVersion]
    const sections=builderVersion==='0.3.5'?[{type:'TextBlock',props:{text:'Legacy'}}]:[
      {type:'BoxBlock',props:{layout:'free',heightMode:'fixed',height:500},children:{children:[
        {type:'ButtonElementBlock',props:{label:'Continuar',href:'/servicios',position:'absolute',anchorX:'right',offsetX:20,offsetY:40,widthMode:'fixed',width:220,heightMode:'fixed',height:60,tabletOffsetX:10,mobileAnchorX:'center',mobileOffsetX:0,mobileWidthMode:'percent',mobileWidthPercent:80}},
      ]}},
    ]
    if(builderVersion==='0.6.1')sections.push({type:'LogoElementBlock',props:{brand:'Marca',tagline:'Texto adicional',brandHref:'/inicio',brandDirection:'column'}})
    if(builderVersion==='0.6.2')for(const type of ['FooterBlock','SiteFooterBlock'])sections.push({type,props:{brand:'Marca',showBrandName:false,tagline:'Pie adicional',logoAlt:'Logo del pie',logoHeight:'48',brandHref:'/inicio',brandDirection:'column'}})
    const {bytes}=await exportWebsiteTemplate({title:'Catalog compatibility',builderVersion,catalog,pages:[{path:'/',title:'Inicio',isHome:true,sections}]})
    const opened=await inspectWebsiteTemplate(bytes,{builderCatalogs:catalogs})
    assert.equal(opened.ok,true,JSON.stringify(opened.errors))
    assert.equal(opened.manifest.builder.min,builderVersion)
    const document=sectionsToDocument({id:'catalog-test',slug:'catalog-test',title:'Inicio',sections:opened.content.pages[0].sections})
    assert.deepEqual(normalizeWebsiteDocument(document,{strict:true}),document)
    const result=documentToSections(document)
    assert.deepEqual(sectionsToDocument({id:'catalog-test',slug:'catalog-test',title:'Inicio',sections:result}),document)
    if(builderVersion==='0.6.0'){
      const props=Object.values(document.blocks).find(b=>b.type==='ButtonElementBlock').props
      for(const [key,value] of Object.entries(sections[0].children.children[0].props))assert.deepEqual(props[key],value,key)
    }
  }
})
