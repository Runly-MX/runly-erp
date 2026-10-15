import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, Card, ConfirmDialog, ErrorState, TextField } from '@runly/ui'
import { useAuth } from '../auth/AuthProvider'
import { useActiveCompany } from './ActiveCompanyProvider'
import { runly } from '../lib/runly'

export function CompanyDeletionPanel() {
  const { userProfile, session } = useAuth()
  const { activeCompany } = useActiveCompany()
  const client = useQueryClient()
  const [open, setOpen] = useState(false)
  const [confirmation, setConfirmation] = useState('')
  const [password, setPassword] = useState('')
  const token = session?.access_token
  const pending = useQuery({ queryKey: ['company-deletions', session?.user?.id], queryFn: () => runly.company.pendingDeletions(token), enabled: Boolean(userProfile?.isAdmin), refetchInterval: 15000 })
  const schedule = useMutation({
    mutationFn: () => runly.company.requestDeletion(activeCompany.id, { confirmation, password }, token),
    onSuccess: () => { setOpen(false); setPassword(''); setConfirmation(''); client.invalidateQueries() },
  })
  const restore = useMutation({ mutationFn: id => runly.company.cancelDeletion(id, token), onSuccess: () => client.invalidateQueries() })
  if (!userProfile?.isAdmin) return null
  return <Card className="space-y-4 border-destructive/40 p-6">
    <h2 className="font-semibold">Eliminar empresa</h2>
    <p className="text-sm text-muted-foreground">La empresa quedará suspendida durante 72 horas. En ese plazo un administrador podrá recuperarla. Después comenzará el borrado definitivo de sus datos, archivos y recursos exclusivos. Las cuentas y los recursos compartidos con otras empresas se conservarán.</p>
    <Button variant="destructive" onClick={() => setOpen(true)}>Eliminar esta empresa</Button>
    {(pending.data?.data ?? []).map(job => <div key={job.companyId} className="space-y-2 border-t pt-3">
      <p className="text-sm">{job.name}: eliminación {job.state === 'PENDING' ? `programada para ${new Date(job.purgeAfter).toLocaleString('es-MX')}` : 'en curso'}.</p>
      {job.canRestore && <Button variant="outline" disabled={restore.isPending} onClick={() => restore.mutate(job.companyId)}>Recuperar empresa</Button>}
    </div>)}
    {restore.error && <ErrorState title="No se pudo recuperar la empresa" description={restore.error.message} />}
    <ConfirmDialog open={open} onOpenChange={value => { setOpen(value); if (!value) { setPassword(''); setConfirmation('') } }} title="Programar eliminación de empresa" description="Se suspenderán todos los accesos a esta empresa. Tendrás 72 horas para cancelar. El plazo exacto quedará registrado al confirmar." confirmLabel="Suspender y programar eliminación" loading={schedule.isPending} confirmDisabled={confirmation !== activeCompany?.name || !password} onConfirm={() => schedule.mutate()}>
      <div className="space-y-4">
        <TextField label={`Escribe ${activeCompany?.name ?? 'el nombre de la empresa'}`} value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" />
        <TextField label="Confirma tu contraseña" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
        {schedule.error && <ErrorState title="No se pudo programar la eliminación" description={schedule.error.message} />}
      </div>
    </ConfirmDialog>
  </Card>
}
