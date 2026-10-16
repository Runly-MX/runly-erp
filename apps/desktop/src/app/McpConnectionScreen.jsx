import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, Checkbox, ConfirmDialog, EmptyState, ErrorState, LoadingState, PageHeader } from '@runly/ui';
import { useAuth } from '../auth/AuthProvider';

const SCOPE_LABELS = { 'runly:read': 'Ver tu identidad, empresas y módulos autorizados', 'inventory:read': 'Consultar equipos y catálogos de inventario', 'inventory:write': 'Preparar y ejecutar altas y ediciones con tu aprobación en Runly' };

export function McpConnectionScreen() {
  const { session } = useAuth();
  const [params] = useSearchParams();
  const requestId = params.get('request'), proposalId = params.get('proposal');
  const [companyIds, setCompanyIds] = useState([]);
  const [revoking, setRevoking] = useState(null);
  const [done, setDone] = useState(false);
  async function api(path, body) {
    // MCP is published through the frontend proxy, independently of the ERP API.
    const response = await fetch(path, { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error_description ?? result.error ?? 'No se pudo completar la solicitud.');
    return result;
  }
  const account = useQuery({ queryKey: ['mcp-account', session.user.id], queryFn: () => api('/mcp/account'), retry: false });
  const detail = useQuery({ queryKey: ['mcp-request', requestId, proposalId, session.user.id], enabled: Boolean(requestId || proposalId), retry: false,
    queryFn: () => api(proposalId ? `/mcp/proposals/${encodeURIComponent(proposalId)}` : `/mcp/oauth/request/${encodeURIComponent(requestId)}`) });
  const action = useMutation({ mutationFn: async approve => {
    if (proposalId) return api(`/mcp/proposals/${encodeURIComponent(proposalId)}`, { approve });
    return api('/mcp/oauth/consent', { requestId, companyIds, approve });
  }, onSuccess: result => {
    if (result.redirect) window.location.assign(result.redirect);
    else { setDone(true); detail.refetch(); }
  } });
  const revoke = useMutation({ mutationFn: grantId => api('/mcp/account/revoke', { grantId }), onSuccess: () => { setRevoking(null); account.refetch(); } });
  const error = account.error || detail.error || action.error || revoke.error;
  if (account.isPending || (detail.isPending && (requestId || proposalId))) return <LoadingState variant="page" />;
  return <main className="mx-auto max-w-2xl space-y-6 p-6">
    <PageHeader title="Conexiones de asistentes" description="Controla el acceso a tus datos de Runly." />
    {error && <ErrorState title="No se pudo completar la solicitud" description={error.message} />}
    {requestId && detail.data && <Card className="space-y-4 p-6">
      <h2 className="text-lg font-semibold">Autorizar conexión: {detail.data.clientName}</h2>
      <p>El nombre lo proporciona la aplicación y no está verificado. Autoriza solo aplicaciones que reconozcas.</p>
      <p className="break-all text-sm">Destino: {detail.data.redirectUri}</p>
      <ul className="list-disc pl-6">{detail.data.scopes.map(scope => <li key={scope}>{SCOPE_LABELS[scope]}</li>)}</ul>
      <p>Selecciona las empresas que podrá consultar. Se aplican tus permisos actuales en cada operación.</p>
      {account.data?.companies.map(company => <label className="flex items-center gap-3" key={company.id}>
        <Checkbox checked={companyIds.includes(company.id)} onCheckedChange={checked => setCompanyIds(ids => checked ? [...ids, company.id] : ids.filter(id => id !== company.id))} />
        {company.name}
      </label>)}
      <div className="flex gap-3"><Button disabled={!companyIds.length || action.isPending} onClick={() => action.mutate(true)}>Autorizar</Button>
        <Button variant="outline" disabled={action.isPending} onClick={() => action.mutate(false)}>Rechazar</Button></div>
    </Card>}
    {proposalId && detail.data && <Card className="space-y-4 p-6">
      <h2 className="text-lg font-semibold">{detail.data.preview.title}</h2>
      <p>Empresa: {account.data?.companies.find(c => c.id === detail.data.companyId)?.name}</p>
      <p>Revisa todos los datos antes de aprobar. La aprobación permite al asistente ejecutar esta propuesta una sola vez durante su vigencia.</p>
      <dl className="space-y-3">{detail.data.preview.fields.map((field, index) => <div key={index}><dt className="font-medium">{field.label}</dt><dd>{field.before !== undefined && <span>Antes: {String(field.before)} · </span>}Nuevo: {String(field.value)}</dd></div>)}</dl>
      <details><summary>Datos completos de la propuesta</summary><pre className="overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-sm">{JSON.stringify(detail.data.proposed, null, 2)}</pre></details>
      {done ? <p role="status">Decisión guardada. Vuelve al asistente para continuar.</p> : <div className="flex gap-3">
        <Button disabled={action.isPending || detail.data.completed} onClick={() => action.mutate(true)}>Aprobar propuesta</Button>
        <Button variant="outline" disabled={action.isPending || detail.data.completed} onClick={() => action.mutate(false)}>Rechazar</Button>
      </div>}
    </Card>}
    {!requestId && !proposalId && <Card className="space-y-4 p-6">
      <h2 className="text-lg font-semibold">Aplicaciones autorizadas</h2>
      {!account.data?.grants.length && <EmptyState title="Sin conexiones activas" description="Aquí aparecerán las aplicaciones que autorices." />}
      {account.data?.grants.map(grant => <div className="flex items-center justify-between gap-4" key={grant.id}>
        <div><p>{grant.clientName}</p><p className="text-sm">{grant.scopes.map(s => SCOPE_LABELS[s]).join(' · ')}</p></div>
        <Button variant="outline" onClick={() => setRevoking(grant)}>Revocar</Button>
      </div>)}
    </Card>}
    <ConfirmDialog open={Boolean(revoking)} onOpenChange={open => { if (!open) setRevoking(null); }} title="Revocar conexión" description="La aplicación perderá el acceso y deberá solicitar tu autorización de nuevo." confirmLabel="Revocar" loading={revoke.isPending} onConfirm={() => revoke.mutate(revoking.id)} />
  </main>;
}
