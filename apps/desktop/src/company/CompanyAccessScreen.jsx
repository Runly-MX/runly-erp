import { useMutation, useQuery } from '@tanstack/react-query'
import { Button, Card, EmptyState, ErrorState, PageHeader } from '@runly/ui'
import { useAuth } from '../auth/AuthProvider'
import { runly } from '../lib/runly'
import { useActiveCompany } from './ActiveCompanyProvider.jsx'

export function CompanyAccessScreen() {
  const { session, logout } = useAuth()
  const { refreshCompanyAccess } = useActiveCompany()
  const token = session?.access_token
  const pending = useQuery({ queryKey: ['company-deletions', session?.user?.id], queryFn: () => runly.company.pendingDeletions(token), refetchInterval: (query) => (query.state.data?.data?.length ? 15_000 : 120_000) })
  const restore = useMutation({
    mutationFn: id => runly.company.cancelDeletion(id, token),
    onSuccess: () => refreshCompanyAccess(),
  })
  return <main className="min-h-screen bg-background p-6 md:p-12"><div className="mx-auto max-w-2xl space-y-6">
    <PageHeader title="Acceso a Runly" description="Tu cuenta se conserva. Necesitas una membresía activa para entrar al ERP." />
    <EmptyState title="Tu cuenta no tiene acceso a ninguna empresa" description="Contacta al administrador para que te incorpore a una empresa. Si te reincorporan, podrás entrar con esta misma cuenta." />
    {pending.error && <ErrorState title="No se pudo consultar la recuperación" description={pending.error.message} />}
    {(pending.data?.data ?? []).map(job => <Card key={job.companyId} className="space-y-3 p-5">
      <h2 className="font-semibold">{job.name}</h2>
      <p className="text-sm text-muted-foreground">{job.state === 'PENDING' ? `Eliminación programada para ${new Date(job.purgeAfter).toLocaleString('es-MX')}.` : 'La eliminación definitiva está en curso. Ya no es posible recuperar la empresa.'}</p>
      {job.canRestore && <Button onClick={() => restore.mutate(job.companyId)} disabled={restore.isPending}>Cancelar eliminación y recuperar empresa</Button>}
    </Card>)}
    {restore.error && <ErrorState title="No se pudo recuperar la empresa" description={restore.error.message} />}
    <div className="flex gap-3"><Button variant="outline" onClick={() => refreshCompanyAccess()}>Volver a comprobar acceso</Button><Button variant="outline" onClick={logout}>Cerrar sesión</Button></div>
  </div></main>
}
