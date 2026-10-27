import {randomBytes} from 'node:crypto'
import {PDFDocument} from 'pdf-lib'
import {StudioError, validateDocument} from '../../../../shared/studio/document.js'
import {documentPages} from '../../../../shared/studio/pages.js'
import {checkAbort} from '../../../../shared/studio/abort.js'
import {studioAssetIds} from './studio-document-data.js'
import {buildPrintPdf} from './studio-print.js'

export const STUDIO_PRINT_JOB_LIMITS = Object.freeze({pages:24, pixels:256_000_000, pagePixels:32_000_000, bytes:64*1024*1024, idleMs:60_000, lifetimeMs:300_000})

// Ephemeral, process-local, revision-pinned export. Only one page bitmap enters
// Sharp at a time. A cancelled native stage keeps its slot until it actually ends.
export function createStudioPrintJobs({getDesign, authorizeAssets, builder=buildPrintPdf, now=Date.now}) {
  let job = null
  const error = (message,status=400) => new StudioError(message,status)
  function discard(current) { if(job===current)job=null; clearTimeout(current.timer); current.pdf=null }
  function expired(current) {return now()-current.last>STUDIO_PRINT_JOB_LIMITS.idleMs || now()-current.created>STUDIO_PRINT_JOB_LIMITS.lifetimeMs}
  function sweep() {if(job&&expired(job)){job.cancelled=true;if(!job.busy)discard(job)}}
  function arm(current) {
    clearTimeout(current.timer)
    const wait=Math.min(STUDIO_PRINT_JOB_LIMITS.idleMs-(now()-current.last),STUDIO_PRINT_JOB_LIMITS.lifetimeMs-(now()-current.created))
    current.timer=setTimeout(()=>{current.cancelled=true;if(!current.busy)discard(current)},Math.max(1,wait))
    current.timer.unref?.()
  }
  function find(companyId,actorId,designId,id) {
    sweep()
    if(!job||job.id!==id||job.companyId!==companyId||job.actorId!==actorId||job.designId!==designId)throw error('Exportación no encontrada o caducada.',404)
    if(job.cancelled)throw error('La exportación fue cancelada.',409)
    job.last=now();arm(job);return job
  }
  async function authorize(current, signal) {
    checkAbort(signal)
    if(current.cancelled||expired(current))throw error('La exportación fue cancelada o caducó.',409)
    const design=await getDesign(current.companyId,current.actorId,current.designId)
    if(design.revision!==current.revision)throw error('El diseño cambió. Revisa la revisión antes de imprimir.',409)
    await authorizeAssets(current.companyId,studioAssetIds(design.document))
    checkAbort(signal)
    if(current.cancelled)throw error('La exportación fue cancelada.',409)
  }
  async function create(companyId,actorId,designId,input,signal) {
    sweep()
    // Authorize before exposing capacity or document metadata.
    const design=await getDesign(companyId,actorId,designId), document=validateDocument(design.document)
    if(!Number.isSafeInteger(input?.revision)||input.revision!==design.revision)throw error('Revisa la revisión actual antes de imprimir.',409)
    if(job)throw error('Hay otra exportación PDF en curso. Reintenta al terminar.',429)
    if(!Array.isArray(input.pages)||!input.pages.length||input.pages.length>24||new Set(input.pages.map(p=>p?.pageId)).size!==input.pages.length)throw error('Rango de páginas no válido.')
    if(!['rgb','cmyk'].includes(input.profile)||typeof input.bleed!=='boolean'||typeof input.cropMarks!=='boolean')throw error('Opciones de impresión no válidas.')
    const ordered=documentPages(document).filter(scene=>input.pages.some(p=>p.pageId===scene.page.id))
    if(ordered.length!==input.pages.length)throw error('Una página ya no existe.',409)
    let pixels=0
    const pages=ordered.map(({page})=>{
      const ppi=input.pages.find(p=>p.pageId===page.id).ppi
      if(![72,96,150,300].includes(ppi))throw error('Resolución de origen no válida.')
      const bleedMm=input.bleed?3:0, widthMm=page.width/ppi*25.4, heightMm=page.height/ppi*25.4
      const width=Math.ceil((widthMm+2*bleedMm)/25.4*300),height=Math.ceil((heightMm+2*bleedMm)/25.4*300)
      if(widthMm<10||heightMm<10||widthMm>2000||heightMm>2000)throw error('Las medidas físicas deben estar entre 10 y 2000 mm.')
      if(width<1||height<1||width>16384||height>16384||width*height>STUDIO_PRINT_JOB_LIMITS.pagePixels)throw error('Una página supera 32 megapíxeles a 300 ppp.',413)
      pixels+=width*height
      return {pageId:page.id,ppi,widthMm,heightMm,bleedMm,width,height}
    })
    if(pixels>STUDIO_PRINT_JOB_LIMITS.pixels)throw error('El PDF supera 256 megapíxeles acumulados.',413)
    const current={id:randomBytes(24).toString('hex'),companyId,actorId,designId,revision:design.revision,pages,profile:input.profile,cropMarks:input.cropMarks,title:design.name,created:now(),last:now(),next:0,busy:false,cancelled:false,bytes:0,pdf:null}
    // Reserve before any asynchronous step so concurrent creates cannot race.
    job=current;arm(current)
    try {await authorize(current,signal);current.pdf=await PDFDocument.create();await authorize(current,signal);return {id:current.id,revision:current.revision,pages,expiresIn:60}}
    catch(error){discard(current);throw error}
  }
  async function append(companyId,actorId,designId,id,pageId,image,signal) {
    const current=find(companyId,actorId,designId,id)
    if(current.busy)throw error('Una página sigue procesándose.',409)
    current.busy=true
    try {
      await authorize(current,signal)
      const page=current.pages[current.next]
      if(!page||page.pageId!==pageId)throw error('Envía las páginas una a una en el orden indicado.',409)
      if(!Buffer.isBuffer(image)||image.length>STUDIO_PRINT_JOB_LIMITS.bytes)throw error('Imagen demasiado grande.',413)
      const output=await builder({...page,image,profile:current.profile,cropMarks:current.cropMarks,title:current.title,signal})
      await authorize(current,signal)
      current.bytes+=output.length
      if(current.bytes>STUDIO_PRINT_JOB_LIMITS.bytes)throw error('El PDF supera 64 MiB.',413)
      const source=await PDFDocument.load(output)
      const [copied]=await current.pdf.copyPages(source,[0])
      current.pdf.addPage(copied)
      await authorize(current,signal)
      current.next++;current.last=now();arm(current)
      return {completed:current.next,total:current.pages.length}
    } catch(error) {current.cancelled=true;throw error}
    finally {current.busy=false;if(current.cancelled)discard(current)}
  }
  async function finish(companyId,actorId,designId,id,signal) {
    const current=find(companyId,actorId,designId,id)
    if(current.busy||current.next!==current.pages.length)throw error('La exportación aún no está completa.',409)
    current.busy=true
    try {
      await authorize(current,signal)
      current.pdf.setTitle(current.title);current.pdf.setCreator('Runly Studio');current.pdf.setProducer('Runly Studio')
      const result=Buffer.from(await current.pdf.save())
      await authorize(current,signal)
      if(result.length>STUDIO_PRINT_JOB_LIMITS.bytes)throw error('El PDF supera 64 MiB.',413)
      return result
    } finally {current.busy=false;discard(current)}
  }
  async function cancel(companyId,actorId,designId,id) {
    // Still check current access; no operation can make a revoked actor a writer.
    await getDesign(companyId,actorId,designId)
    const current=find(companyId,actorId,designId,id)
    current.cancelled=true
    if(!current.busy)discard(current)
    return {cancelled:true}
  }
  return {create,append,finish,cancel}
}
