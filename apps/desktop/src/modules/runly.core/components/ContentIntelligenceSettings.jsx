import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent, Badge, Button, Card, CheckboxField, ComboboxField, ConfirmDialog, DateField, ErrorState, SelectField, TextField } from '@runly/ui';
import { toast } from 'sonner';
import { runly } from '../../../lib/runly';
import { useAuth } from '../../../auth/AuthProvider';
import { useActiveCompany } from '../../../company/ActiveCompanyProvider';

const PROFILES = [{ value: 'OFF', label: 'Desactivado' }, { value: 'LIGHT', label: 'Ligero' }, { value: 'SMART', label: 'Inteligente' },
  { value: 'DEDICATED', label: 'Dedicado' }, { value: 'CUSTOM', label: 'Personalizado' }];
const QUALITIES = [{ value: 'fast', label: 'Rápido' }, { value: 'balanced', label: 'Equilibrado' }, { value: 'accurate', label: 'Alta precisión' }];
const NUMBERS = [['concurrency', 'Trabajos simultáneos', 1, 4], ['maxPages', 'Páginas máximas', 1, 200],
  ['maxFileBytes', 'Tamaño máximo (bytes)', 1024, 67108864], ['maxPixels', 'Píxeles máximos', 100000, 40000000],
  ['timeoutSeconds', 'Tiempo máximo por trabajo (segundos)', 10, 900], ['retries', 'Intentos máximos', 1, 5], ['maxPending', 'Pendientes máximos', 1, 1000],
  ['memoryMiB','Presupuesto de memoria por trabajo (MiB)',128,4096],['threads','Hilos internos máximos',1,4],['cpuBudgetPercent','Uso medio del presupuesto de CPU (%)',10,100],
  ['dailyProcessingSeconds','Procesamiento diario por empresa (segundos)',60,86400],['retentionDays','Retención de resultados (días)',1,3650]];
const OPERATIONAL = { disabled: ['Desactivado', 'secondary'], 'not-installed': ['Worker no instalado', 'secondary'], disconnected: ['Worker desconectado', 'secondary'],
  'paused-manual': ['Pausado manualmente', 'secondary'], 'outside-schedule': ['Fuera del horario autorizado', 'secondary'],
  'paused-resources': ['Pausado por recursos', 'secondary'], operational: ['Operativo', 'success'] };
const STATES = { pending:'Pendientes',processing:'Procesando',done:'Texto disponible',partial:'Parciales',empty:'Sin texto',failed:'Fallidos',unsupported:'Omitidos',cancelled:'Cancelados' };
const MODES = [{value:'all',label:'Todos los elegibles'},{value:'never',label:'Nunca procesados'},{value:'failed',label:'Fallidos'},
  {value:'lowQuality',label:'Confianza baja'},{value:'oldEngine',label:'Motor anterior'}];

function PolicyForm({ status, scope, token }) {
  const { activeCompanyId } = useActiveCompany();
  const folders = useQuery({queryKey:['content-folders',activeCompanyId],queryFn:()=>runly.files.folders.tree(token),enabled:scope==='company'});
  const [config, setConfig] = useState(status.config);
  const [languages, setLanguages] = useState(status.config.languages.join(','));
  const [confirm, setConfirm] = useState(null);
  const [types, setTypes] = useState(()=>status.config.allowedMimeTypes.join(','));
  const [filters,setFilters] = useState({mode:'all',mime:'',folderId:'',fromDate:'',toDate:'',quality:status.config.quality});
  const [schedule,setSchedule] = useState(()=>status.config.schedule);
  const filterPayload = Object.fromEntries(Object.entries(filters).filter(([,value])=>value!=='').map(([key,value])=>[
    key,key==='fromDate'?`${value}T00:00:00.000Z`:key==='toDate'?`${value}T23:59:59.999Z`:value]));
  const client = useQueryClient();
  const update = (key, value) => setConfig(previous => ({ ...previous, [key]: value }));
  const action = useMutation({ mutationFn: operation => operation === 'save'
    ? runly.contentIntelligence.configure(scope, { ...config, schedule, languages: languages.split(',').map(value => value.trim()).filter(Boolean),allowedMimeTypes:types.split(',').map(value=>value.trim()).filter(Boolean) }, token)
    : operation === 'purge' ? runly.contentIntelligence.purge(token)
      : runly.contentIntelligence.backfill({ action: operation,filters:filterPayload }, token),
  onSuccess: () => { client.invalidateQueries({ queryKey: ['content-admin'] }); setConfirm(null); toast.success('Cambio aplicado'); },
  onError: error => toast.error(error.message) });
  const connected = status.workers.find(worker=>worker.connected);
  const physical = connected?.capabilities;
  const compatible = physical?.protocol>=2;
  const [operationalLabel, operationalVariant] = OPERATIONAL[status.operational] ?? OPERATIONAL.disabled;
  return <div className="space-y-4">
    <Badge variant={operationalVariant} role="status">{operationalLabel}</Badge>
    <div className="flex flex-wrap gap-2"><Badge variant={compatible ? 'success' : 'secondary'}>{physical ? compatible?'Worker conectado':'Actualizar worker':status.workers.length?'Worker desconectado':'Worker no registrado'}</Badge><Badge variant="secondary">{status.engine}</Badge></div>
    {!compatible && <div className="rounded-lg border border-dashed p-3 text-xs space-y-2"><p>La activación requiere un worker compatible instalado por infraestructura.</p><p>Desde el repositorio, configura el secreto privado en API y worker y ejecuta:</p><code className="block break-words whitespace-pre-wrap">docker compose -f docker-compose.yml -f infra/docker/content.compose.yml --profile content up -d --build content-worker</code><p>En instalaciones sin fuentes utiliza el overlay docker-compose.content.yml con una imagen verificada. No se instala desde este interruptor.</p></div>}
    <p className="text-xs text-muted-foreground">{scope === 'instance' ? 'Límites de la instancia. Cada empresa debe activar su propia política.' : 'Política de esta empresa. Los límites efectivos se reducen a los autorizados por la instancia.'}</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField label="Perfil" value={config.profile} options={PROFILES} onChange={value => update('profile', value)} />
      <SelectField label="Calidad OCR" value={config.quality} options={QUALITIES} onChange={value => update('quality', value)} />
      <TextField label="Idiomas (códigos separados por coma)" value={languages} onChange={e => setLanguages(e.target.value)} />
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      {[['paused', 'Pausar procesamiento'], ['searchEnabled', 'Buscar en resultados existentes'], ['automaticProcessing','Procesar archivos nuevos automáticamente'],['digitalExtraction','Extraer texto digital'],['autoOcr','OCR automático'],['manualOcr', 'Permitir OCR manual'],['imageOcr','OCR de imágenes'],['pdfOcr','OCR de PDF escaneados'], ['historical', 'Autorizar indexación histórica']].map(([key, label]) => <CheckboxField key={key} label={label} checked={config[key]} onChange={event => update(key, event.target.checked)} />)}
    </div>
    <p className="text-xs text-muted-foreground">LIGHT extrae documentos digitales. SMART, DEDICATED y CUSTOM permiten OCR automático. Los perfiles no instalan el worker ni amplían sus límites físicos.</p>
    {scope === 'instance' && <p className="text-xs text-muted-foreground">Límite físico observado: {physical?.cpuLimit ?? 'sin telemetría'} CPU · {physical?.memoryLimit ? `${Math.round(physical.memoryLimit / 1048576)} MiB RAM` : 'RAM desconocida'}. Para cambiarlo, actualiza el contenedor desde infraestructura.</p>}
    {scope==='instance' && physical?.memoryLimit && <p className="text-xs text-muted-foreground">Memoria efectiva máxima por trabajo en este worker: {Math.min(status.effective.memoryMiB,Math.floor(physical.memoryLimit*0.85/1048576))} MiB. {Math.min(status.effective.memoryMiB,Math.floor(physical.memoryLimit*0.85/1048576))<384?'Este presupuesto no permite alta precisión.':'Concurrencia uno es la recomendación inicial conservadora; ampliar solo con mediciones.'}</p>}
    {scope==='instance' && physical && <p className="text-xs text-muted-foreground">Uso observado del worker: {Math.round((physical.memoryUsed??0)/1048576)} MiB · CPU {physical.cpuUsedPercent==null?'sin muestra':`${Math.round(physical.cpuUsedPercent)}% del límite asignado`} · {physical.governor==='ready'?'Disponible':physical.governor==='paused'?'En pausa por recursos':'Recursos sin verificar'}{physical.tempFreeBytes!=null?` · Temporal libre: ${Math.round(physical.tempFreeBytes/1048576)} MiB`:''}.</p>}
    <p className="text-xs text-muted-foreground">Idiomas instalados: {physical?.languages?.join(', ')||'Sin información'} · Modelos: {Object.keys(physical?.models??{}).join(', ')||'Sin información'}</p>
    {connected?.heartbeatAt && <p className="text-xs text-muted-foreground">Último heartbeat: {new Date(connected.heartbeatAt).toLocaleString('es-MX')}</p>}
    <Accordion type="multiple">
      <AccordionItem value="limits"><AccordionTrigger>Presupuestos y límites</AccordionTrigger><AccordionContent><div className="grid gap-4 sm:grid-cols-2">
        {NUMBERS.map(([key,label,min,max])=><TextField key={key} type="number" label={label} value={config[key]} min={min} max={max} onChange={event=>update(key,Number(event.target.value))} />)}
        <TextField label="Tipos MIME permitidos (vacío: todos los compatibles)" value={types} onChange={event=>setTypes(event.target.value)} />
      </div><p className="mt-3 text-xs text-muted-foreground">Presupuesto autorizado por políticas: {status.effective.memoryMiB} MiB por trabajo, {status.effective.threads} hilos y {status.effective.cpuBudgetPercent}% de la CPU asignada. Los topes físicos del contenedor prevalecen. Alta precisión requiere al menos 384 MiB efectivos; no garantiza mejor exactitud para todos los documentos.</p></AccordionContent></AccordionItem>
      <AccordionItem value="schedule"><AccordionTrigger>Horario de procesamiento</AccordionTrigger><AccordionContent><div className="space-y-3">
        <TextField label="Zona horaria de procesamiento" value={schedule.timeZone} onChange={event=>setSchedule(previous=>({...previous,timeZone:event.target.value}))} />
        <p className="text-xs text-muted-foreground">Sin ventanas, se permite cualquier hora. Una ventana que cruza medianoche continúa al día siguiente.</p>
        {schedule.windows.map((window,index)=><div key={index} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-3">
          <div className="sm:col-span-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'].map((label,day)=><CheckboxField key={label} label={label} checked={window.days.includes(day)} onChange={event=>setSchedule(previous=>({...previous,windows:previous.windows.map((w,i)=>i===index?{...w,days:event.target.checked?[...w.days,day]:w.days.filter(d=>d!==day)}:w)}))} />)}</div>
          <TextField label="Desde (HH:MM)" value={window.start} onChange={event=>setSchedule(previous=>({...previous,windows:previous.windows.map((w,i)=>i===index?{...w,start:event.target.value}:w)}))} />
          <TextField label="Hasta (HH:MM)" value={window.end} onChange={event=>setSchedule(previous=>({...previous,windows:previous.windows.map((w,i)=>i===index?{...w,end:event.target.value}:w)}))} />
          <Button variant="outline" onClick={()=>setSchedule(previous=>({...previous,windows:previous.windows.filter((_,i)=>i!==index)}))}>Quitar ventana</Button>
        </div>)}
        <Button variant="outline" disabled={schedule.windows.length>=14} onClick={()=>setSchedule(previous=>({...previous,windows:[...previous.windows,{days:[0,1,2,3,4,5,6],start:'22:00',end:'06:00'}]}))}>Añadir ventana</Button>
      </div></AccordionContent></AccordionItem>
      {scope==='company' && <AccordionItem value="historical"><AccordionTrigger>Seleccionar archivos históricos</AccordionTrigger><AccordionContent><div className="grid gap-4 sm:grid-cols-2">
        <SelectField label="Archivos a procesar" options={MODES} value={filters.mode} onChange={value=>setFilters(previous=>({...previous,mode:value}))} />
        <SelectField label="Calidad para el recorrido" options={QUALITIES} value={filters.quality} onChange={value=>setFilters(previous=>({...previous,quality:value}))} />
        <ComboboxField label="Carpeta" placeholder="Todas las carpetas" options={(folders.data?.data?.folders??[]).map(folder=>({value:folder.id,label:folder.name}))} value={filters.folderId} onChange={value=>setFilters(previous=>({...previous,folderId:value??''}))} />
        <TextField label="Tipo MIME o prefijo (opcional)" value={filters.mime} onChange={event=>setFilters(previous=>({...previous,mime:event.target.value}))} />
        <DateField label="Creado desde (UTC)" value={filters.fromDate} onChange={event=>setFilters(previous=>({...previous,fromDate:event.target.value}))} />
        <DateField label="Creado hasta (UTC)" value={filters.toDate} onChange={event=>setFilters(previous=>({...previous,toDate:event.target.value}))} />
      </div></AccordionContent></AccordionItem>}
    </Accordion>
    <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
      <p>Concurrencia efectiva: {status.effective.concurrency} · Páginas: {status.effective.maxPages} · Perfil: {status.effective.profile}</p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">{status.counts.map(item=><div key={item.state}><dt>{STATES[item.state]??item.state}</dt><dd className="text-base font-semibold">{item.count}</dd></div>)}</dl>
      <p>Texto y metadatos derivados: {Math.round(status.counts.reduce((n,item)=>n+(item.derivedBytes??0),0)/1024)} KiB. No incluye el tamaño físico de índices.</p>
      {scope==='instance' && Number.isFinite(status.indexBytes) && <p>Índices de contenido de la instancia: {Math.round(status.indexBytes/1024)} KiB.</p>}
      <p>Intentos finalizados (hasta los 1,000 más recientes de 15 minutos): {status.rate?.completed??0}. Sin datos suficientes para estimar finalización.</p>
      {status.backfill.map(item => <p key={`${item.companyId}:${item.kind}`}>{item.kind === 'new' ? 'Archivos nuevos' : 'Histórico'}: {item.state} · {item.discovered} recorridos · {item.enqueued} encolados · {item.omitted} omitidos</p>)}
      {status.recent?.filter(item=>item.errorCode).slice(0,5).map((item,index)=><p key={index}>Incidencia: {item.errorCode} · {STATES[item.state]??item.state}</p>)}
      {status.pressure && <p>Presión de la API: {status.pressure.paused?'procesamiento en pausa':'sin pausa'} · Host completo: sin telemetría.</p>}
    </div>
    <div className="flex flex-wrap gap-2">
      <Button disabled={action.isPending} onClick={() => action.mutate('save')}>Guardar política</Button>
      {scope === 'company' && <>
        <Button variant="outline" disabled={action.isPending} onClick={() => setConfirm('start')}>Iniciar histórico</Button>
        <Button variant="outline" disabled={action.isPending} onClick={() => action.mutate('pause')}>Pausar histórico</Button>
        <Button variant="outline" disabled={action.isPending} onClick={() => action.mutate('resume')}>Reanudar histórico</Button>
        <Button variant="outline" disabled={action.isPending} onClick={() => setConfirm('cancel')}>Cancelar histórico</Button>
        <Button variant="destructive" disabled={action.isPending} onClick={() => setConfirm('purge')}>Purgar derivados</Button>
      </>}
    </div>
    <ConfirmDialog open={Boolean(confirm)} onOpenChange={open => !open && setConfirm(null)} title={confirm === 'purge' ? '¿Eliminar los resultados derivados?' : confirm === 'cancel' ? '¿Cancelar el recorrido histórico?' : '¿Procesar los archivos históricos?'}
      description={confirm === 'purge' ? 'Se eliminarán los textos e índices de esta empresa. Los originales se conservan.' : 'Esta acción se aplica a la empresa activa. El procesamiento respeta la política guardada.'}
      confirmLabel="Confirmar" onConfirm={() => action.mutate(confirm)} />
  </div>;
}

export function ContentIntelligenceSettings({ scope = 'instance', enabled = true }) {
  const { session, userProfile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const token = session?.access_token;
  const status = useQuery({ queryKey: ['content-admin', scope, userProfile?.id, activeCompanyId], queryFn: () => runly.contentIntelligence.status(scope, token),
    enabled: Boolean(token) && enabled, refetchInterval: 15000 });
  if (!enabled) return null;
  return <Card className="min-w-0 p-4 space-y-4" aria-label={`Procesamiento de ${scope==='instance'?'instancia':'empresa'}`}><h2 className="text-base font-semibold">Procesamiento inteligente de archivos · {scope==='instance'?'Instancia':'Empresa'}</h2>
    {status.isError ? <ErrorState message={status.error.message} /> : status.data?.data
      ? <PolicyForm key={`${scope}:${activeCompanyId}:${status.data.data.config.profile}`} status={status.data.data} scope={scope} token={token} />
      : <p role="status" className="text-sm text-muted-foreground">Consultando el servicio…</p>}
  </Card>;
}
