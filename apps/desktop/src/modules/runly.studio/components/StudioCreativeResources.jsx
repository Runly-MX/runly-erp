import { useEffect, useId, useRef, useState } from 'react'
import { Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, ErrorState, SearchInput, SegmentedControl, SelectField, Skeleton, cn } from '@runly/ui'
import { ChevronLeft, ChevronRight, ImageOff, Search } from 'lucide-react'
import { runly } from '../../../lib/runly.js'
import { ICON_COLLECTIONS } from '../../../../../shared/studio/licenses.js'
import { scheduled } from '../lib/resource-queue.js'
import { StudioResources } from './StudioResources.jsx'

// Photos fill the tile (cover) and fade in; icons (dark strokes) sit on a light
// tile in both themes. Placeholder and failure use theme tokens, never white.
function CatalogImage({resource,token,fit='cover'}) {
  const node=useRef(null),[url,setUrl]=useState(''),[failed,setFailed]=useState(false),[loaded,setLoaded]=useState(false)
  const icon=resource.provider==='iconify'
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
  return <div ref={node} className={cn('relative flex h-full min-h-20 w-full items-center justify-center overflow-hidden rounded-lg',
    icon&&url?'bg-white dark:bg-slate-100':'bg-[hsl(var(--muted)/0.6)]')}>
    {!url&&!failed?<Skeleton className="absolute inset-0 h-full w-full rounded-none"/>:null}
    {failed?<span className="flex flex-col items-center gap-1 text-[hsl(var(--muted-foreground))]"><ImageOff aria-hidden className="h-5 w-5"/><span className="text-[10px]">Sin vista previa</span></span>:null}
    {url?<img src={url} alt="" onLoad={()=>setLoaded(true)} className={cn('h-full w-full transition-[opacity,transform] duration-300 ease-out motion-reduce:transition-none',
      icon?'object-contain p-3':fit==='cover'?'object-cover':'object-contain', loaded?'scale-100 opacity-100':'scale-[1.02] opacity-0')}/>:null}
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
    {loading?<div className="grid grid-cols-3 gap-2" aria-busy="true" aria-label="Buscando recursos">{Array.from({length:6},(_,i)=><div key={i} className="space-y-1.5"><Skeleton className="aspect-square rounded-xl"/><Skeleton className="h-2.5 w-3/4 rounded-full"/></div>)}</div>:null}
    {error&&!preview?<ErrorState variant="compact" title="Catálogo no disponible" description={error} onRetry={()=>setRetry(value=>value+1)}/>:null}
    {result&&!result.data.length?<EmptyState variant="compact" icon={Search} title={result.requiresQuery?'Busca tu próximo recurso':'Sin recursos compatibles'} description={result.requiresQuery?'Escribe una búsqueda para consultar el catálogo.':'Prueba otra consulta; las licencias y orígenes no admitidos se excluyen.'}/>:null}
    <ul className="grid grid-cols-3 gap-2">
      {result?.data.map(resource=><li key={resource.id}><button type="button" onClick={()=>setPreview(resource)} aria-label={`Ver recurso ${resource.title}`} title={resource.title}
        className="group w-full text-left focus-visible:outline-none">
        <div className="aspect-square overflow-hidden rounded-xl ring-1 ring-[hsl(var(--border))] transition-[box-shadow] group-hover:ring-2 group-hover:ring-fuchsia-500/50 group-focus-visible:ring-2 group-focus-visible:ring-[hsl(var(--ring))]">
          <div className="h-full w-full transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none motion-reduce:group-hover:scale-100"><CatalogImage resource={resource} token={token}/></div>
        </div>
        <p className="truncate px-0.5 pt-1.5 text-xs text-[hsl(var(--muted-foreground))] group-hover:text-[hsl(var(--foreground))]">{resource.title}</p>
      </button></li>)}
    </ul>
    {q?<nav className="flex items-center justify-between gap-1" aria-label="Paginación de recursos">
      <Button size="sm" variant="ghost" disabled={page===1||loading} onClick={()=>setPage(value=>value-1)}><ChevronLeft/>Anterior</Button><span className="text-xs">{page}</span>
      <Button size="sm" variant="ghost" disabled={!result?.pagination.hasNext||loading} onClick={()=>setPage(value=>value+1)}>Siguiente<ChevronRight/></Button>
    </nav>:null}
    <Dialog open={Boolean(preview)} onOpenChange={open=>{if(!open&&!inserting){setPreview(null);setError('')}}}>
      <DialogContent size="md"><DialogHeader><DialogTitle>{preview?.title}</DialogTitle><DialogDescription>Revisa el origen y las condiciones de uso antes de insertar.</DialogDescription></DialogHeader>
        {preview?<><div className="h-64 overflow-hidden rounded-xl"><CatalogImage key={preview.id} resource={preview} token={token} fit="contain"/></div>
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
