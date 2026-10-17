import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { KeyRound, ListChecks, PlugZap, ShieldAlert, ShieldCheck } from 'lucide-react';
import { Button, ConfirmDialog, EmptyState, ErrorState, LoadingState } from '@runly/ui';
import { useAuth } from '../auth/AuthProvider';
import { ActionBar, CompanyOption, Destination, FieldChanges, McpPage, Notice, Panel, PanelHeader, ScopeList, SectionLabel, SensitiveCheck, scopeLabel } from './McpConnectionParts.jsx';

export function McpConnectionScreen() {
  const { session } = useAuth();
  const [params] = useSearchParams();
  const requestId = params.get('request'), proposalId = params.get('proposal');
  const [companyIds, setCompanyIds] = useState([]);
  const [revoking, setRevoking] = useState(null);
  const [completedProposal, setCompletedProposal] = useState(null);
  const [acknowledgedProposal, setAcknowledgedProposal] = useState(null);
  const done = proposalId !== null && completedProposal === proposalId;
  const sensitiveAcknowledged = proposalId !== null && acknowledgedProposal === proposalId;
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
    if (proposalId) return api(`/mcp/proposals/${encodeURIComponent(proposalId)}`, { approve, ...(detail.data?.sensitive ? { acknowledgeSensitive: sensitiveAcknowledged } : {}) });
    return api('/mcp/oauth/consent', { requestId, companyIds, approve });
  }, onSuccess: result => {
    if (result.redirect) window.location.assign(result.redirect);
    else { setCompletedProposal(proposalId); detail.refetch(); }
  } });
  const revoke = useMutation({ mutationFn: grantId => api('/mcp/account/revoke', { grantId }), onSuccess: () => { setRevoking(null); account.refetch(); } });
  const error = account.error || detail.error || action.error || revoke.error;
  if (account.isPending || (detail.isPending && (requestId || proposalId))) return <LoadingState variant="page" />;
  const request = requestId && detail.data, proposal = proposalId && detail.data;
  const toggleCompany = id => checked => setCompanyIds(ids => checked ? [...ids, id] : ids.filter(x => x !== id));
  return <McpPage>
    <div className="space-y-1">
      <h1 className="text-2xl font-semibold tracking-tight">{request ? 'Autorizar conexión' : proposal ? 'Revisar propuesta' : 'Conexiones de asistentes'}</h1>
      <p className="text-sm text-[hsl(var(--muted-foreground))]">{request ? 'Una aplicación quiere conectarse a tu cuenta de Runly.' : proposal ? 'Un asistente propone un cambio. Nada se ejecuta sin tu aprobación.' : 'Controla el acceso a tus datos de Runly.'}</p>
    </div>
    {error && <ErrorState title="No se pudo completar la solicitud" description={error.message} />}
    {request && <Panel>
      <PanelHeader icon={PlugZap} title={detail.data.clientName} subtitle="Aplicación solicitante" />
      <div className="space-y-5 p-4 sm:p-5">
        <Notice icon={ShieldAlert} tone="warning">El nombre lo proporciona la aplicación y no está verificado. Autoriza solo aplicaciones que reconozcas.</Notice>
        <Destination uri={detail.data.redirectUri} />
        <div className="space-y-2"><SectionLabel>Permisos solicitados</SectionLabel><ScopeList scopes={detail.data.scopes} /></div>
        <div className="space-y-2">
          <SectionLabel>Empresas</SectionLabel>
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Selecciona las empresas que podrá consultar. Se aplican tus permisos actuales en cada operación.</p>
          <div className="grid gap-2">{account.data?.companies.map(company => <CompanyOption key={company.id} company={company} checked={companyIds.includes(company.id)} onChange={toggleCompany(company.id)} />)}</div>
        </div>
      </div>
      <ActionBar>
        <Button variant="outline" disabled={action.isPending} onClick={() => action.mutate(false)}>Rechazar</Button>
        <Button disabled={!companyIds.length || action.isPending} onClick={() => action.mutate(true)}>Autorizar</Button>
      </ActionBar>
    </Panel>}
    {proposal && <Panel>
      <PanelHeader icon={ListChecks} title={detail.data.preview.title} subtitle={`Empresa: ${account.data?.companies.find(c => c.id === detail.data.companyId)?.name ?? '—'}`} />
      <div className="space-y-5 p-4 sm:p-5">
        <Notice>Revisa todos los datos antes de aprobar. La aprobación permite al asistente ejecutar esta propuesta una sola vez durante su vigencia.</Notice>
        {Array.isArray(detail.data.proposed?.effects) && detail.data.proposed.effects.length > 0 && <div className="space-y-2"><SectionLabel>Efectos previstos</SectionLabel><ul className="list-disc space-y-1 pl-5 text-sm leading-relaxed">{detail.data.proposed.effects.map(effect => <li key={effect}>{effect}</li>)}</ul></div>}
        <div className="space-y-2"><SectionLabel>Datos a aplicar</SectionLabel><FieldChanges fields={detail.data.preview.fields} /></div>
        <details className="rounded-md border border-[hsl(var(--border))]"><summary className="cursor-pointer select-none p-3 text-sm font-medium">Datos completos de la propuesta</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words border-t border-[hsl(var(--border))] bg-[hsl(var(--muted))] p-3 text-xs">{JSON.stringify(detail.data.proposed, null, 2)}</pre></details>
        {detail.data.sensitive && !done && <SensitiveCheck checked={sensitiveAcknowledged} onChange={checked => setAcknowledgedProposal(checked === true ? proposalId : null)} />}
        {done && <p role="status" className="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/10 p-3 text-sm"><ShieldCheck size={18} aria-hidden="true" />Decisión guardada. Vuelve al asistente para continuar.</p>}
      </div>
      {!done && <ActionBar>
        <Button variant="outline" disabled={action.isPending || detail.data.completed} onClick={() => action.mutate(false)}>Rechazar</Button>
        <Button disabled={action.isPending || detail.data.completed || detail.data.rejected || detail.data.sensitive && !sensitiveAcknowledged} onClick={() => action.mutate(true)}>Aprobar propuesta</Button>
      </ActionBar>}
    </Panel>}
    {!requestId && !proposalId && <Panel>
      <PanelHeader icon={KeyRound} title="Aplicaciones autorizadas" subtitle="Asistentes con acceso a tu cuenta" />
      <div className="p-4 sm:p-5">
        {!account.data?.grants.length && <EmptyState title="Sin conexiones activas" description="Aquí aparecerán las aplicaciones que autorices." />}
        <ul className="space-y-3">{account.data?.grants.map(grant => <li className="flex flex-col gap-3 rounded-md border border-[hsl(var(--border))] p-3 sm:flex-row sm:items-center sm:justify-between" key={grant.id}>
          <div className="min-w-0 space-y-1"><p className="break-words font-medium">{grant.clientName}</p><p className="text-xs leading-relaxed text-[hsl(var(--muted-foreground))]">{grant.scopes.map(scopeLabel).join(' · ')}</p></div>
          <Button variant="outline" className="min-h-11 shrink-0" onClick={() => setRevoking(grant)}>Revocar</Button>
        </li>)}</ul>
      </div>
    </Panel>}
    <ConfirmDialog open={Boolean(revoking)} onOpenChange={open => { if (!open) setRevoking(null); }} title="Revocar conexión" description="La aplicación perderá el acceso y deberá solicitar tu autorización de nuevo." confirmLabel="Revocar" loading={revoke.isPending} onConfirm={() => revoke.mutate(revoking.id)} />
  </McpPage>;
}
