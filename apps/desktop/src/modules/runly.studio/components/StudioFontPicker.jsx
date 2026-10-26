import { useEffect,useId,useState } from 'react'
import { SelectField,ErrorState,Skeleton } from '@runly/ui'
import { STUDIO_FONTS } from '../../../../../shared/studio/fonts.js'
import { ensureStudioFont } from '../lib/studio-fonts.js'
export function StudioFontPicker({value,disabled,onChange}) {
  const id=useId()
  const [loaded,setLoaded]=useState(''),[error,setError]=useState(''),[retry,setRetry]=useState(0)
  useEffect(()=>{let active=true;setLoaded('');setError('');ensureStudioFont(value).then(()=>{if(active)setLoaded(value)}).catch(error=>{if(active)setError(error.message)});return()=>{active=false}},[value,retry])
  return <div className="space-y-2">
    <SelectField id={id} label="Tipografía" value={value} disabled={disabled} options={STUDIO_FONTS.map(font=>({value:font.family,label:`${font.name} · ${font.category}`}))} onChange={onChange}/>
    {error?<ErrorState variant="compact" title="Fuente no disponible" description={error} onRetry={()=>setRetry(value=>value+1)}/>:
      loaded===value?<p aria-label="Vista previa de la fuente" className="rounded-lg bg-[hsl(var(--muted)/0.5)] p-3 text-xl" style={{fontFamily:value,fontWeight:400,fontStyle:'normal'}}>Ideas que toman forma</p>:<Skeleton className="h-14" aria-label="Cargando fuente"/>}
    <p className="text-[11px] text-[hsl(var(--muted-foreground))]">Regular · 400 {value==='sans-serif'?'· Fuente del sistema':'· OFL 1.1 · Archivo local'}</p>
  </div>
}
