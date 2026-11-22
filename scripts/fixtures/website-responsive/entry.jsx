import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AtlasWebBuilderEditor, AtlasWebBuilderProvider, AtlasWebRenderer, baseBlocks, useEditorStoreInstance } from '@raulbellosom/atlas-web-builder'
import { StoreNavbarBlock } from '../../../packages/website-blocks/src/storeNavbarBlock.jsx'
import { ContactFormBlock } from '../../../packages/website-blocks/src/contactFormBlock.jsx'
import { SiteFooterBlock } from '../../../packages/website-blocks/src/siteFooterBlock.jsx'
import {universalRunlyBlocks,ecommerceRunlyBlocks,bookingsRunlyBlocks,restaurantRunlyBlocks} from '../../../packages/website-blocks/src/index.js'
import '@raulbellosom/atlas-web-builder/styles'

const blocks=[...new Map([...baseBlocks,StoreNavbarBlock,ContactFormBlock,SiteFooterBlock,...universalRunlyBlocks,...ecommerceRunlyBlocks,...bookingsRunlyBlocks,...restaurantRunlyBlocks].map(block=>[block.type,block])).values()]
window.foundationBlockTypes=[...new Set([...universalRunlyBlocks,...ecommerceRunlyBlocks,...bookingsRunlyBlocks,...restaurantRunlyBlocks].map(block=>block.type))]
const params=new URLSearchParams(location.search)
const original={schemaVersion:1,id:'responsive-foundation',slug:'/',title:'Responsive foundation',visibility:'public',seo:{},regions:{main:{children:['nav','box','footer']}},blocks:{
  nav:{id:'nav',type:'StoreNavbarBlock',props:{brand:'Estudio Norte',links:'Inicio | /\nColección | /coleccion\nHistorias | /historias\nContacto | /contacto',sticky:false}},
  box:{id:'box',type:'BoxBlock',props:{widthMode:'fill',paddingLeft:32,paddingRight:32,paddingTop:40,paddingBottom:40,mobilePaddingLeft:16,mobilePaddingRight:16,gap:32,mobileGap:16},children:{children:['title','copy','grid','form']}},
  title:{id:'title',type:'TextElementBlock',props:{tag:'h1',text:'Ideas que toman forma',fontSize:64,tabletFontSize:44,mobileFontSize:28,lineHeight:1.1,widthMode:'fill'}},
  copy:{id:'copy',type:'TextElementBlock',props:{text:'Un diseño editable que acompaña el ancho disponible. Palabraslargasquetambiénnecesitanadaptarsealcontenedor.',fontSize:18,widthMode:'fill'}},
  grid:{id:'grid',type:'BoxBlock',props:{layout:'grid',columns:3,tabletColumns:2,mobileColumns:1,mobileLayout:'grid',gap:24,mobileGap:12,widthMode:'fill'},children:{children:['card1','card2','card3']}},
  ...Object.fromEntries([1,2,3].map(n=>[`card${n}`,{id:`card${n}`,type:'TextElementBlock',props:{text:`Colección ${n}`,stylePreset:'card',widthMode:'fill',fontSize:24,mobileFontSize:20}}])),
  form:{id:'form',type:'ContactFormBlock',props:{formId:'fixture-newsletter',buttonLabel:'Suscribirme',successMessage:'Suscripción de prueba recibida.'}},
  footer:{id:'footer',type:'SiteFooterBlock',props:{brand:'Estudio Norte'}},
}}
let store,saved
if(params.has('navpair')){original.blocks.secondNav={...original.blocks.nav,id:'secondNav'};original.regions.main.children=['nav','secondNav']}
if(params.has('form'))original.blocks.form.props.formId=params.get('form')==='unresolved'?'@newsletter':'fixture-newsletter'
function Probe(){store=useEditorStoreInstance();return null}
window.foundationFormCalls=0
window.RunlyERP={getForm:async id=>{window.foundationFormCalls++;if(params.get('form')==='error')throw Error('Fixture form unavailable');if(params.get('form')==='loading')await new Promise(resolve=>{window.foundationResolveForm=resolve});return {id,fields:[{name:'email',label:'Correo electrónico',fieldType:'email',required:true}]}},submitForm:async(_form,values,options)=>{window.foundationSubmission=values;window.foundationSubmissionOptions=options;return {message:'Recibido'}}}
function App(){
  const [initial,setInitial]=useState(original),[session,setSession]=useState(0)
  const [audit,setAudit]=useState(params.get('audit'))
  window.foundationAudit=setAudit
  window.foundation={state:()=>store?.getState(),select:id=>store.getState().select(id),device:value=>store.getState().setDevice(value),save:()=>{saved=JSON.parse(JSON.stringify(store.getState().page))},reopen:()=>{setInitial(saved);setSession(n=>n+1)},undo:()=>store.temporal.getState().undo(),redo:()=>store.temporal.getState().redo()}
  if(params.get('mode')==='edit')return <div data-foundation-session={session} style={{height:'100vh'}}><AtlasWebBuilderEditor key={session} blocks={blocks} initialPage={initial} brandLogo={<Probe/>}/></div>
  const page=audit?{...original,id:audit,regions:{main:{children:['audit']}},blocks:{audit:{id:'audit',type:audit,props:{}}}}:original
  return <div style={{width:params.has('width')?Number(params.get('width')):'100%',marginInline:'auto'}}><AtlasWebBuilderProvider blocks={blocks}><AtlasWebRenderer key={audit} page={page} mode={params.get('mode')==='preview'?'preview':'public'} eagerBlocks={300}/></AtlasWebBuilderProvider></div>
}
createRoot(document.getElementById('root')).render(<App/> )
