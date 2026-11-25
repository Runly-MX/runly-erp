import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, CheckboxField, ConfirmDialog, ErrorState, SelectField, TextField } from '@runly/ui';
import { toast } from 'sonner';
import { runly } from '../../../lib/runly';
import { useAuth } from '../../../auth/AuthProvider';
import { useActiveCompany } from '../../../company/ActiveCompanyProvider';

const PROFILES = [{ value: 'OFF', label: 'Desactivado' }, { value: 'LIGHT', label: 'Ligero' }, { value: 'SMART', label: 'Inteligente' },
  { value: 'DEDICATED', label: 'Dedicado' }, { value: 'CUSTOM', label: 'Personalizado' }];
const QUALITIES = [{ value: 'fast', label: 'Rápido' }, { value: 'balanced', label: 'Equilibrado' }, { value: 'accurate', label: 'Alta precisión' }];
const NUMBERS = [['concurrency', 'Trabajos simultáneos', 1, 4], ['maxPages', 'Páginas máximas', 1, 200],
  ['maxFileBytes', 'Tamaño máximo (bytes)', 1024, 67108864], ['maxPixels', 'Píxeles máximos', 100000, 40000000],
  ['timeoutSeconds', 'Tiempo máximo por trabajo (segundos)', 10, 900], ['retries', 'Intentos máximos', 1, 5], ['maxPending', 'Pendientes máximos', 1, 1000]];

function PolicyForm({ status, scope, token }) {
  const [config, setConfig] = useState(status.config);
  const [languages, setLanguages] = useState(status.config.languages.join(','));
  const [confirm, setConfirm] = useState(null);
  const client = useQueryClient();
  const update = (key, value) => setConfig(previous => ({ ...previous, [key]: value }));
  const action = useMutation({ mutationFn: operation => operation === 'save'
    ? runly.contentIntelligence.configure(scope, { ...config, languages: languages.split(',').map(value => value.trim()).filter(Boolean) }, token)
    : operation === 'purge' ? runly.contentIntelligence.purge(token)
      : runly.contentIntelligence.backfill({ action: operation }, token),
  onSuccess: () => { client.invalidateQueries({ queryKey: ['content-admin'] }); setConfirm(null); toast.success('Cambio aplicado'); },
  onError: error => toast.error(error.message) });
  const physical = status.workers.find(worker => worker.connected)?.capabilities;
  return <div className="space-y-4">
    <div className="flex flex-wrap gap-2"><Badge variant={physical ? 'success' : 'secondary'}>{physical ? 'Worker conectado' : 'Worker desconectado'}</Badge><Badge variant="secondary">{status.engine}</Badge></div>
    <p className="text-xs text-muted-foreground">{scope === 'instance' ? 'Límites de la instancia. Cada empresa debe activar su propia política.' : 'Política de esta empresa. Los límites efectivos se reducen a los autorizados por la instancia.'}</p>
    <div className="grid gap-4 sm:grid-cols-2">
      <SelectField label="Perfil" value={config.profile} options={PROFILES} onChange={value => update('profile', value)} />
      <SelectField label="Calidad OCR" value={config.quality} options={QUALITIES} onChange={value => update('quality', value)} />
      <TextField label="Idiomas (códigos separados por coma)" value={languages} onChange={e => setLanguages(e.target.value)} />
      {NUMBERS.map(([key, label, min, max]) => <TextField key={key} type="number" label={label} value={config[key]} min={min} max={max} onChange={e => update(key, Number(e.target.value))} />)}
    </div>
    <div className="grid gap-3 sm:grid-cols-2">
      {[['paused', 'Pausar procesamiento'], ['searchEnabled', 'Buscar en resultados existentes'], ['manualOcr', 'Permitir OCR manual'], ['historical', 'Autorizar indexación histórica']].map(([key, label]) => <CheckboxField key={key} label={label} checked={config[key]} onChange={event => update(key, event.target.checked)} />)}
    </div>
    <p className="text-xs text-muted-foreground">LIGHT extrae documentos digitales. SMART, DEDICATED y CUSTOM permiten OCR automático. Los perfiles no instalan el worker ni amplían sus límites físicos.</p>
    {scope === 'instance' && <p className="text-xs text-muted-foreground">Límite físico observado: {physical?.cpuLimit ?? 'sin telemetría'} CPU · {physical?.memoryLimit ? `${Math.round(physical.memoryLimit / 1048576)} MiB RAM` : 'RAM desconocida'}. Para cambiarlo, actualiza el contenedor desde infraestructura.</p>}
    <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1">
      <p>Concurrencia efectiva: {status.effective.concurrency} · Páginas: {status.effective.maxPages} · Perfil: {status.effective.profile}</p>
      <p>Cola: {status.counts.map(item => `${item.state}: ${item.count}`).join(' · ') || 'Sin trabajos'}</p>
      {status.backfill.map(item => <p key={`${item.companyId}:${item.kind}`}>{item.kind === 'new' ? 'Archivos nuevos' : 'Histórico'}: {item.state} · {item.discovered} registros recorridos</p>)}
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
  return <Card className="p-4 space-y-4"><h2 className="text-base font-semibold">Procesamiento inteligente de archivos</h2>
    {status.isError ? <ErrorState message={status.error.message} /> : status.data?.data
      ? <PolicyForm key={`${scope}:${activeCompanyId}:${status.data.data.config.profile}`} status={status.data.data} scope={scope} token={token} />
      : <p role="status" className="text-sm text-muted-foreground">Consultando el servicio…</p>}
  </Card>;
}
