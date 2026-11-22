import { useState } from 'react'
import { createRoot } from 'react-dom/client'
import { AtlasWebBuilderEditor, AtlasWebBuilderProvider, AtlasWebRenderer, baseBlocks, useEditorStoreInstance } from '@raulbellosom/atlas-web-builder'
import { StoreNavbarBlock } from '../../../packages/website-blocks/src/storeNavbarBlock.jsx'
import { ContactFormBlock } from '../../../packages/website-blocks/src/contactFormBlock.jsx'
import { SiteFooterBlock } from '../../../packages/website-blocks/src/siteFooterBlock.jsx'
import '@raulbellosom/atlas-web-builder/styles'

const blocks=[...baseBlocks,StoreNavbarBlock,ContactFormBlock,SiteFooterBlock]
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
function Probe(){store=useEditorStoreInstance();return null}
window.RunlyERP={getForm:async id=>({id,fields:[{name:'email',label:'Correo electrónico',fieldType:'email',required:true}]}),submitForm:async(_form,values)=>{window.foundationSubmission=values;return {message:'Recibido'}}}
function App(){
  const [initial,setInitial]=useState(original),[session,setSession]=useState(0)
  window.foundation={state:()=>store?.getState(),select:id=>store.getState().select(id),device:value=>store.getState().setDevice(value),save:()=>{saved=JSON.parse(JSON.stringify(store.getState().page))},reopen:()=>{setInitial(saved);setSession(n=>n+1)},undo:()=>store.temporal.getState().undo(),redo:()=>store.temporal.getState().redo()}
  if(params.get('mode')==='edit')return <div data-foundation-session={session} style={{height:'100vh'}}><AtlasWebBuilderEditor key={session} blocks={blocks} initialPage={initial} brandLogo={<Probe/>}/></div>
  return <div style={{width:params.has('width')?Number(params.get('width')):'100%',marginInline:'auto'}}><AtlasWebBuilderProvider blocks={blocks}><AtlasWebRenderer page={original} mode={params.get('mode')==='preview'?'preview':'public'} eagerBlocks={300}/></AtlasWebBuilderProvider></div>
}
createRoot(document.getElementById('root')).render(<App/> )
