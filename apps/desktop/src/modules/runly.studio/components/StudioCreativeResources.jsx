import { useEffect, useId, useRef, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, ErrorState, SearchInput, SegmentedControl, SelectField, Skeleton } from '@runly/ui'
import { ChevronLeft, ChevronRight, ImageOff, Search } from 'lucide-react'
import { runly } from '../../../lib/runly.js'
import { ICON_COLLECTIONS } from '../../../../../shared/studio/licenses.js'
import { scheduled } from '../lib/resource-queue.js'
import { StudioResources } from './StudioResources.jsx'

function CatalogImage({resource,token}) {
  const node=useRef(null),[url,setUrl]=useState(''),[failed,setFailed]=useState(false)
  useEffect(()=>{
    const controller=new AbortController();let objectUrl='',started=false
    const observer=new IntersectionObserver(entries=>{
      if(started||!entries.some(row=>row.isIntersecting))return
      started=true;observer.disconnect()
      scheduled(()=>runly.studio.catalogThumbnail(resource.provider,resource.id,token,controller.signal),controller.signal).then(blob=>{
        if(!controller.signal.aborted){objectUrl=URL.createObjectURL(blob);setUrl(objectUrl)}
      }).catch(()=>{if(!controller.signal.aborted)setFailed(true)})
    },{rootMargin:'80px'})
    observer.observe(node.current)
    return()=>{controller.abort();observer.disconnect();if(objectUrl)URL.revokeObjectURL(objectUrl)}
  },[resource.provider,resource.id,token])
  return <div ref={node} className="flex h-full min-h-20 w-full items-center justify-center overflow-hidden rounded-lg bg-white">
    {url?<img src={url} alt="" className="h-full w-full object-contain p-2"/>:failed?<ImageOff aria-label="Miniatura no disponible" className="h-6 w-6 text-slate-500"/>:<Skeleton className="h-full min-h-20 w-full"/>}
  </div>
}

function ProviderCatalog({provider,token,designId,disabled,onInsert}) {
  const collectionId=useId()
  const [search,setSearch]=useState(''),[q,setQ]=useState(''),[page,setPage]=useState(1),[collection,setCollection]=useState('tabler')
  const [result,setResult]=useState(null),[error,setError]=useState(''),[loading,setLoading]=useState(false),[retry,setRetry]=useState(0)
  const [preview,setPreview]=useState(null),[inserting,setInserting]=useState(false)
  useEffect(()=>{const timer=setTimeout(()=>{setQ(search.trim());setPage(1)},300);return()=>clearTimeout(timer)},[search])
  useEffect(()=>{
    const controller=new AbortController();setResult(null);setLoading(true);setError('')
    runly.studio.catalogSearch(provider,token,{q,page,collection},controller.signal).then(response=>{if(!controller.signal.aborted)setResult(response.data)})
      .catch(error=>{if(!controller.signal.aborted)setError(error.message)}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
    return()=>controller.abort()
  },[provider,token,q,page,collection,retry])
  async function insert() {
    if(disabled||inserting)return
    setInserting(true);setError('')
    try{const response=await runly.studio.catalogImport(provider,preview.id,designId,token);await onInsert(response.data);setPreview(null)}
    catch(error){setError(error.message)}finally{setInserting(false)}
  }
  return <section className="space-y-3" aria-label={provider==='iconify'?'Catálogo de iconos':'Catálogo de fotografías'}>
    <SearchInput aria-label={provider==='iconify'?'Buscar iconos':'Buscar fotografías'} placeholder={provider==='iconify'?'Buscar iconos (p. ej. star)':'Buscar fotografías'} value={search} maxLength={80} onChange={event=>setSearch(event.target.value)} onClear={()=>setSearch('')}/>
    {provider==='iconify'?<SelectField id={collectionId} label="Colección" value={collection} options={ICON_COLLECTIONS.map(row=>({value:row.id,label:`${row.name} · ${row.license}`}))} onChange={value=>{setCollection(value);setPage(1)}}/>:
      <p className="text-xs text-[hsl(var(--muted-foreground))]">Openverse · CC0, dominio público y CC BY. Orígenes admitidos: Wikimedia y Flickr. Revisa los créditos antes de publicar.</p>}
    {loading?<div className="grid grid-cols-3 gap-2" aria-busy="true" aria-label="Buscando recursos">{Array.from({length:6},(_,i)=><Skeleton key={i} className="aspect-square"/>)}</div>:null}
    {error&&!preview?<ErrorState variant="compact" title="Catálogo no disponible" description={error} onRetry={()=>setRetry(value=>value+1)}/>:null}
    {result&&!result.data.length?<EmptyState variant="compact" icon={Search} title={result.requiresQuery?'Busca tu próximo recurso':'Sin recursos compatibles'} description={result.requiresQuery?'Escribe una búsqueda para consultar el catálogo.':'Prueba otra consulta; las licencias y orígenes no admitidos se excluyen.'}/>:null}
    <ul className="grid grid-cols-3 gap-2">
      {result?.data.map(resource=><li key={resource.id}><button type="button" onClick={()=>setPreview(resource)} aria-label={`Ver recurso ${resource.title}`} className="w-full rounded-xl border border-[hsl(var(--border))] p-1 text-left hover:border-fuchsia-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]">
        <div className="aspect-square"><CatalogImage resource={resource} token={token}/></div><p className="truncate px-1 py-1 text-xs">{resource.title}</p>
      </button></li>)}
    </ul>
    {q?<nav className="flex items-center justify-between gap-1" aria-label="Paginación de recursos">
      <Button size="sm" variant="ghost" disabled={page===1||loading} onClick={()=>setPage(value=>value-1)}><ChevronLeft/>Anterior</Button><span className="text-xs">{page}</span>
      <Button size="sm" variant="ghost" disabled={!result?.pagination.hasNext||loading} onClick={()=>setPage(value=>value+1)}>Siguiente<ChevronRight/></Button>
    </nav>:null}
    <Dialog open={Boolean(preview)} onOpenChange={open=>{if(!open&&!inserting){setPreview(null);setError('')}}}>
      <DialogContent size="md"><DialogHeader><DialogTitle>{preview?.title}</DialogTitle><DialogDescription>Revisa el origen y las condiciones de uso antes de insertar.</DialogDescription></DialogHeader>
        {preview?<><div className="h-56"><CatalogImage key={preview.id} resource={preview} token={token}/></div>
          <dl className="space-y-1 text-sm"><div><dt className="inline font-medium">Autor: </dt><dd className="inline">{preview.author}</dd></div><div><dt className="inline font-medium">Licencia: </dt><dd className="inline"><a href={preview.licenseUrl} target="_blank" rel="noopener noreferrer" className="underline">{preview.license}</a></dd></div></dl>
          <a href={preview.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-sm underline">Consultar página de origen</a>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">{preview.attributionRequired?'Conserva los créditos al compartir o publicar.':'Se conservarán el origen y la licencia.'} {provider==='openverse'?'El original seleccionado se guardará en Files.':'La geometría editable quedará dentro del diseño.'}</p></>:null}
        {error?<ErrorState variant="compact" title="No se pudo insertar" description={error}/>:null}
        <DialogFooter><Button variant="outline" disabled={inserting} onClick={()=>{setPreview(null);setError('')}}>Cerrar</Button><Button disabled={disabled||inserting} onClick={insert}>{inserting?'Importando…':'Insertar recurso'}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </section>
}

export function StudioCreativeResources({token,designId,disabled,onFileInsert,onVectorInsert,uploader}) {
  const [tab,setTab]=useState('files')
  return <div className="space-y-4">
    <SegmentedControl ariaLabel="Tipo de recursos" value={tab} onChange={setTab} options={[{value:'files',label:'Archivos'},{value:'openverse',label:'Fotos'},{value:'iconify',label:'Iconos'}]}/>
    {tab==='files'?<StudioResources token={token} disabled={disabled} uploader={uploader} onInsert={onFileInsert}/>:<ProviderCatalog key={tab} provider={tab} token={token} designId={designId} disabled={disabled} onInsert={async result=>{if(result.object)await onVectorInsert(result.object);else await onFileInsert(result.file)}}/>}
  </div>
}
