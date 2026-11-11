import {useRef,useState} from 'react'
import {useQuery,useQueryClient} from '@tanstack/react-query'
import {Alert,AlertDescription,Button,CheckboxField,ComboboxField,Dialog,DialogContent,DialogHeader,DialogTitle,DialogDescription,DialogFooter,ErrorState} from '@runly/ui'
import {AtlasWebBuilderProvider,AtlasWebRenderer,baseBlocks,defaultTheme} from '@raulbellosom/atlas-web-builder'
import {mapWebsiteImages} from '@runly/studio-interchange/website-document'
import {buildRunlyBlocks} from './runlyBlocks/index.js'
import {runly} from '../lib/runly.js'
import {releaseRef} from '../lib/marketplace-import.js'
import {MarketplaceResourcePicker} from '../components/marketplace/MarketplaceResourcePicker.jsx'
import '@raulbellosom/atlas-web-builder/styles'
import './runlySite.css'

const disconnected=new Set(['ContactFormBlock','BookingFormBlock','BlogIndexBlock','ProductsGridBlock','ProductCardBlock','ProductDetailBlock','MenuGridBlock'])
function Disconnected(){return <p>Marcador sin conexión; no recibe envíos ni realiza operaciones.</p>}
export function WebsiteTemplatePreview({report,pagePath}) {
 const p=report.pages.find(p=>p.path===pagePath)??report.pages[0],urls=new Map(report.assets.map(a=>[`asset:${a.sha256}`,`data:${a.mime};base64,${a.base64}`]))
 const page=mapWebsiteImages(p.document,report.catalog,value=>urls.get(value)??value)
 const blocks=[...new Map([...baseBlocks,...buildRunlyBlocks('website'),...buildRunlyBlocks('ecommerce'),...buildRunlyBlocks('restaurant'),...buildRunlyBlocks('bookings')].map(b=>[b.type,disconnected.has(b.type)?{...b,render:Disconnected}:b])).values()]
 const theme={...defaultTheme,tokens:Object.fromEntries(Object.entries(defaultTheme.tokens).map(([k,v])=>[k,{...v,...report.themeTokens[k]}]))}
 return <div className="max-h-96 overflow-auto rounded-lg border" onClickCapture={e=>{if(e.target.closest('a'))e.preventDefault()}} onKeyDownCapture={e=>{if(e.key==='Enter'&&e.target.closest('a'))e.preventDefault()}}><AtlasWebBuilderProvider blocks={blocks} theme={theme}><AtlasWebRenderer page={page} mode="preview"/></AtlasWebBuilderProvider></div>
}
export function MarketplaceWebsiteDialog({open,onOpenChange,token,siteId:initialSite,initialResource,onInstalled}) {
 const queryClient=useQueryClient(),key=useRef(null)
 const [resource,setResource]=useState(initialResource??null),[siteId,setSiteId]=useState(initialSite??''),[ack,setAck]=useState(false)
 const [report,setReport]=useState(null),[selected,setSelected]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false),[result,setResult]=useState(null)
 const [includeTheme,setTheme]=useState(true),[replace,setReplace]=useState(false),[forms,setForms]=useState(false),[accept,setAccept]=useState(false)
 const sites=useQuery({queryKey:['website-marketplace-sites',token],queryFn:async()=>(await runly.website.listSites(token)).data,enabled:Boolean(open&&token)})
 async function inspect(){setBusy(true);setError('');try{const r=(await runly.website.inspectMarketplaceTemplate(siteId,releaseRef(resource,ack),token)).data;setReport(r);setSelected(r.pages.map(p=>p.path));setTheme(r.requirements.theme);setAccept(false);setReplace(false);setForms(false);key.current=crypto.randomUUID()}catch(e){setError(e.message)}finally{setBusy(false)}}
 async function install(){setBusy(true);setError('');try{const r=(await runly.website.installMarketplaceTemplate(siteId,{ref:releaseRef(resource,ack),pageIds:selected,expectedRevision:report.expectedRevision,includeTheme,replaceExisting:replace,formMode:forms?'local':'disabled',acceptWarnings:true},key.current,token)).data;setResult(r);queryClient.invalidateQueries({queryKey:['website-pages']})}catch(e){setError(e.message)}finally{setBusy(false)}}
 const conflict=report?.pages.some(p=>selected.includes(p.path)&&p.conflict)
 return <Dialog open={open} onOpenChange={value=>{if(!busy)onOpenChange(value)}}><DialogContent className="max-h-[90vh] overflow-auto sm:max-w-4xl"><DialogHeader><DialogTitle>Usar en Website</DialogTitle><DialogDescription>Crea borradores editables con Atlas. Publicar en el dominio es una acción independiente.</DialogDescription></DialogHeader>
  {error&&<ErrorState title="No se pudo completar la operación" description={error}/>}
  {result?<><p role="status">Instalación completada: {result.pages.length} páginas y {Object.keys(result.assets).length} imágenes. El sitio público permanece sin cambios.</p><Button onClick={()=>onInstalled(result)}>Editar con Atlas</Button></>:<>
   {!report?<><MarketplaceResourcePicker type="website_template" token={token} value={resource} onChange={setResource} acknowledged={ack} onAcknowledge={setAck} disabled={busy}/><ComboboxField label="Sitio destino" options={(sites.data??[]).map(s=>({value:s.id,label:s.name}))} value={siteId} onChange={setSiteId} disabled={busy}/><Button disabled={busy||!resource||!siteId} onClick={inspect}>Revisar plantilla y conflictos</Button></>:<>
    <p className="font-semibold">{resource.title} · {report.assets.length} imágenes · revisión del sitio {report.expectedRevision}</p>
    <p>Empresa activa · Sitio destino: {(sites.data??[]).find(s=>s.id===siteId)?.name??siteId}</p>
    <Alert><AlertDescription>Derechos según los avisos originales: {report.licenses.map(l=>l.redistribution).join(', ')||'sin imágenes'}. La validación técnica no acredita autorización de redistribución. Revisa los enlaces a páginas no seleccionadas.</AlertDescription></Alert>
    <WebsiteTemplatePreview report={report} pagePath={selected[0]}/>
    {report.pages.map(p=><CheckboxField key={p.path} label={`${p.title} · ${p.path}${p.conflict?' · ruta en conflicto':''}`} checked={selected.includes(p.path)} onChange={e=>setSelected(list=>e.target.checked?[...list,p.path]:list.filter(path=>path!==p.path))} disabled={busy}/>)}
    <CheckboxField label="Aplicar tema al borrador del sitio" checked={includeTheme} disabled={busy||!report.requirements.theme} onChange={e=>setTheme(e.target.checked)}/>
    {conflict&&<CheckboxField label="Sustituir explícitamente las páginas en conflicto en el borrador" checked={replace} disabled={busy} onChange={e=>setReplace(e.target.checked)}/>}
    {report.requirements.forms.length>0&&<CheckboxField label="Crear formularios locales, sin correo ni conexiones externas. Desmarcado: conservar los bloques desconectados." checked={forms} disabled={busy||!report.requirements.formsLocal} onChange={e=>setForms(e.target.checked)}/>}
    {report.requirements.forms.length>0&&!forms&&<p>Se conservan los marcadores. La publicación seguirá bloqueada hasta vincular formularios autorizados.</p>}
    {!report.requirements.files&&report.assets.length>0&&<p role="alert">Necesitas permiso para crear archivos de esta empresa.</p>}
    {!report.requirements.home&&selected.includes('/')&&<p role="alert">Necesitas permiso para cambiar el inicio del sitio.</p>}
    {report.requirements.legacyPublicBaseline&&<p role="alert">Este sitio tiene contenido público anterior al modelo de releases. Sella primero una versión del sitio actual mediante su flujo de publicación; luego podrás instalar borradores sin alterar lo público.</p>}
    <CheckboxField label="He revisado páginas, conflictos, requisitos y avisos de licencia" checked={accept} disabled={busy} onChange={e=>setAccept(e.target.checked)}/>
    <DialogFooter><Button variant="outline" disabled={busy} onClick={()=>setReport(null)}>Cambiar selección</Button><Button disabled={busy||!accept||!selected.length||(conflict&&!replace)||(!report.requirements.files&&report.assets.length>0)||(!report.requirements.home&&selected.includes('/'))||report.requirements.legacyPublicBaseline} onClick={install}>{busy?'Instalando borrador…':'Confirmar instalación'}</Button></DialogFooter>
   </>}
  </>}
 </DialogContent></Dialog>
}
