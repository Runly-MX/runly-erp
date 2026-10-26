import { useEffect,useState } from 'react'
import { Button,Dialog,DialogContent,DialogDescription,DialogFooter,DialogHeader,DialogTitle,ErrorState,Textarea } from '@runly/ui'
import { runly } from '../../../lib/runly.js'
import { creditsText } from '../../../../../shared/studio/licenses.js'
export function StudioCredits({id,token,scene,action,onClose,onContinue}) {
  const [text,setText]=useState(null),[error,setError]=useState(''),[copied,setCopied]=useState(false),[retry,setRetry]=useState(0)
  useEffect(()=>{let active=true;setText(null);setError('');runly.studio.credits(id,scene,token).then(response=>{if(active)setText(creditsText(response.data)||'Este diseño no utiliza recursos de catálogos externos.')}).catch(error=>{if(active)setError(error.message)});return()=>{active=false}},[id,token,scene,retry])
  function download() {
    const url=URL.createObjectURL(new Blob([text],{type:'text/plain;charset=utf-8'}))
    Object.assign(document.createElement('a'),{href:url,download:'studio-creditos.txt'}).click();setTimeout(()=>URL.revokeObjectURL(url),1000)
  }
  return <Dialog open onOpenChange={open=>{if(!open)onClose()}}><DialogContent size="md">
    <DialogHeader><DialogTitle>Créditos del diseño</DialogTitle><DialogDescription>Conserva estas atribuciones al publicar o compartir tu composición.</DialogDescription></DialogHeader>
    {error?<ErrorState title="No se pudieron comprobar los créditos" description={error} onRetry={()=>setRetry(value=>value+1)}/>:<Textarea aria-label="Créditos para publicar" readOnly rows={9} value={text??'Comprobando recursos y permisos…'}/>}
    <div className="flex flex-wrap gap-2"><Button variant="outline" disabled={text===null} onClick={async()=>{try{await navigator.clipboard.writeText(text);setCopied(true)}catch{setError('No se pudo copiar. Puedes descargar los créditos.')}}}>{copied?'Copiados':'Copiar créditos'}</Button><Button variant="outline" disabled={text===null} onClick={download}>Descargar créditos</Button></div>
    <DialogFooter><Button variant="outline" onClick={onClose}>Cerrar</Button>{action?<Button disabled={text===null} onClick={onContinue}>{action.kind==='share'?'Continuar a compartir':`Exportar ${action.format.toUpperCase()}`}</Button>:null}</DialogFooter>
  </DialogContent></Dialog>
}
