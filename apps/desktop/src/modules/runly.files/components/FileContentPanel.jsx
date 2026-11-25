import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, EmptyState, ErrorState, SearchInput } from '@runly/ui';
import { toast } from 'sonner';
import { runly } from '../../../lib/runly';
import { useAuth } from '../../../auth/AuthProvider';
import { useActiveCompany } from '../../../company/ActiveCompanyProvider';

const LABELS = { disabled: 'Procesamiento desactivado', unprocessed: 'Sin procesar', pending: 'Pendiente', processing: 'Procesando', done: 'Texto disponible',
  partial: 'Procesamiento parcial', empty: 'Sin texto detectable', failed: 'Error de procesamiento', unsupported: 'No compatible', cancelled: 'Cancelado' };

export function FileContentPanel({ file }) {
  const { session, userProfile } = useAuth();
  const { activeCompanyId } = useActiveCompany();
  const token = session?.access_token;
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const result = useQuery({ queryKey: ['file-content', userProfile?.id, activeCompanyId, file.id, file.contentRevision],
    queryFn: () => runly.contentIntelligence.result(file.id, token), enabled: Boolean(token),
    refetchInterval: query => ['pending', 'processing'].includes(query.state.data?.data?.state) ? 4000 : false });
  const data = result.isError ? null : result.data?.data;
  const canProcess = Boolean(userProfile?.isAdmin || userProfile?.permissions?.includes('files.assets.update'));
  const canCancel = Boolean(userProfile?.isAdmin || file.uploadedById === userProfile?.id);
  const action = useMutation({ mutationFn: quality => quality === 'cancel'
    ? runly.contentIntelligence.cancel(file.id, token)
    : runly.contentIntelligence.process(file.id, { quality, reprocess: true }, token),
  onSuccess: () => client.invalidateQueries({ queryKey: ['file-content'] }), onError: error => toast.error(error.message) });
  const text = (data?.pages ?? []).map(page => `${page.reference}\n${page.text}`).join('\n\n');
  const pages = (data?.pages ?? []).filter(page => !search || page.text.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const link = document.createElement('a'); link.href = url; link.download = `${file.originalName}.txt`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };
  return <section className="space-y-3 rounded-xl border p-3" aria-label="Texto del archivo">
    <h3 className="text-sm font-semibold">Texto del archivo</h3>
    {result.isError ? <ErrorState message={result.error.message} /> : <p role="status" className="text-xs text-muted-foreground">{result.isLoading ? 'Consultando…' : LABELS[data?.state] ?? 'Sin procesar'}{data?.state === 'processing' ? ` · ${data.progress}%` : ''}</p>}
    <div className="flex flex-wrap gap-2">
      {canProcess && <>
        <Button size="sm" variant="outline" disabled={action.isPending || ['pending','processing'].includes(data?.state)} onClick={() => action.mutate('balanced')}>Reconocer texto</Button>
        <Button size="sm" variant="outline" disabled={action.isPending || ['pending','processing'].includes(data?.state)} onClick={() => action.mutate('accurate')}>Alta precisión</Button>
      </>}
      {canCancel && ['pending','processing'].includes(data?.state) && <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate('cancel')}>Cancelar</Button>}
      {text && <><Button size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(text).then(() => toast.success('Texto copiado')).catch(() => toast.error('No se pudo copiar.'))}>Copiar texto</Button><Button size="sm" variant="outline" onClick={download}>Descargar texto</Button></>}
    </div>
    {text ? <>
      <SearchInput value={search} onChange={e => setSearch(e.target.value)} onClear={() => setSearch('')} placeholder="Buscar en el texto…" />
      <div className="max-h-80 space-y-4 overflow-auto text-sm" tabIndex={0}>
        {pages.map(page => <article key={page.unit}><p className="text-xs text-muted-foreground">{page.reference} · {page.source === 'ocr' ? 'OCR' : 'Texto digital'}{page.confidence != null ? ` · Confianza heurística ${Math.round(page.confidence)}` : ''}</p><p className="whitespace-pre-wrap break-words select-text">{page.text}</p></article>)}
        {!pages.length && <EmptyState title="Sin coincidencias en el texto" />}
      </div>
    </> : data?.state === 'empty' ? <EmptyState title="No se detectó texto" /> : null}
  </section>;
}
