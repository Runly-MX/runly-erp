import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { AlertTriangle, Archive, Clock, MailCheck, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import {
  Alert, AlertDescription, AlertTitle, Button, Card, CheckboxField, Dialog, DialogContent,
  DialogDescription, DialogFooter, DialogTitle, ErrorState, TextField,
} from '@runly/ui'
import { useAuth } from '../auth/AuthProvider'
import { useActiveCompany } from './ActiveCompanyProvider'
import { runly } from '../lib/runly'

const CONSEQUENCES = [
  { icon: Clock, text: 'Todos los accesos a la empresa se suspenden de inmediato. Tendrás 72 horas para recuperarla.' },
  { icon: Trash2, text: 'Pasado el plazo se borran de forma definitiva sus datos, archivos y recursos exclusivos.' },
  { icon: Archive, text: 'Tu cuenta y los recursos compartidos con otras empresas se conservan.' },
]

const NOTICE_FAILURES = {
  smtp_not_configured: 'No hay un remitente SMTP configurado.',
  smtp_auth_failed: 'El servidor de correo rechazó las credenciales.',
  smtp_connection_failed: 'No se pudo conectar con el servidor de correo.',
  smtp_secret_unreadable: 'Es necesario volver a guardar la contraseña SMTP.',
  smtp_attachment_unavailable: 'Falta una imagen del aviso en el servidor.',
}

function useDeletionJobs() {
  const { userProfile, session } = useAuth()
  const { refreshCompanyAccess } = useActiveCompany()
  const token = session?.access_token
  const jobs = useQuery({
    queryKey: ['company-deletions', session?.user?.id],
    queryFn: () => runly.company.pendingDeletions(token),
    enabled: Boolean(userProfile?.isAdmin),
    refetchInterval: 15000,
  })
  const restore = useMutation({
    mutationFn: id => runly.company.cancelDeletion(id, token),
    onSuccess: () => { toast.success('La empresa fue recuperada.'); return refreshCompanyAccess() },
    onError: error => toast.error(error.message ?? 'No se pudo recuperar la empresa.'),
  })
  return { isAdmin: Boolean(userProfile?.isAdmin), jobs: jobs.data?.data ?? [], restore }
}

function DeletionNotices({ jobs, restore }) {
  return <div className="space-y-3">
    {jobs.map(job => <Alert key={job.companyId} variant="destructive">
      <AlertTriangle className="h-4 w-4" />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <AlertTitle>{job.name}: eliminación {job.state === 'PENDING' ? 'programada' : 'en curso'}</AlertTitle>
          <AlertDescription>
            {job.state === 'PENDING'
              ? `El borrado definitivo comenzará el ${new Date(job.purgeAfter).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })}.`
              : 'Se están eliminando los datos y archivos de la empresa.'}
          </AlertDescription>
        </div>
        {job.canRestore && <Button variant="outline" size="sm" loading={restore.isPending} onClick={() => restore.mutate(job.companyId)}>Recuperar empresa</Button>}
      </div>
    </Alert>)}
  </div>
}

// The profile status must only describe the company currently being viewed.
export function CompanyDeletionBanner() {
  const { activeCompanyId } = useActiveCompany()
  const { isAdmin, jobs, restore } = useDeletionJobs()
  const current = jobs.filter(job => String(job.companyId) === String(activeCompanyId))
  if (!isAdmin || !current.length) return null
  return <DeletionNotices jobs={current} restore={restore} />
}

// Keep recovery reachable after suspension selects another company, without
// presenting another company's deletion as the active profile's status.
export function CompanyDeletionRecoveryPanel() {
  const { activeCompanyId, activeCompany } = useActiveCompany()
  const { isAdmin, jobs, restore } = useDeletionJobs()
  const others = jobs.filter(job => String(job.companyId) !== String(activeCompanyId))
  if (!isAdmin || !others.length) return null
  return <Card className="space-y-4 p-6">
    <div className="space-y-1">
      <h2 className="text-sm font-semibold">Eliminaciones de otras empresas</h2>
      <p className="text-sm text-[hsl(var(--muted-foreground))]">
        Estas solicitudes corresponden a otras empresas que administras. No afectan a «{activeCompany?.name}», la empresa abierta.
      </p>
    </div>
    <DeletionNotices jobs={others} restore={restore} />
  </Card>
}

function ScheduleDeletionDialog({ open, onOpenChange }) {
  const { session } = useAuth()
  const { activeCompany, refreshCompanyAccess } = useActiveCompany()
  const [confirmation, setConfirmation] = useState('')
  const [password, setPassword] = useState('')
  const [notifyMembers, setNotifyMembers] = useState(false)
  const name = activeCompany?.name ?? ''
  const schedule = useMutation({
    mutationFn: companyId => runly.company.requestDeletion(companyId, { confirmation, password, notifyMembers }, session?.access_token),
    onSuccess: (result, companyId) => {
      toast.success('La eliminación de la empresa quedó programada. Puedes recuperarla durante 72 horas.')
      const notice = result?.data?.notice
      if (notice?.sent) toast.success(`Aviso enviado a ${notice.sent} ${notice.sent === 1 ? 'miembro' : 'miembros'}.`)
      if (notice?.failed) toast.warning(`La eliminación sigue programada, pero no se pudo enviar el aviso a algunos miembros. ${NOTICE_FAILURES[notice.reasons?.[0]] ?? 'No se confirmó el envío del correo.'}`)
      close(false)
      return refreshCompanyAccess({ removedCompanyId: companyId })
    },
  })
  function close(value) {
    onOpenChange(value)
    if (!value) { setConfirmation(''); setPassword(''); setNotifyMembers(false); schedule.reset() }
  }
  const ready = Boolean(name) && confirmation === name && Boolean(password)
  return <Dialog open={open} onOpenChange={close}>
    <DialogContent size="lg" scrollable className="p-0 md:p-0">
      <div className="shrink-0 border-b border-[hsl(var(--border))] px-6 py-5 pr-12">
        <div className="flex items-start gap-4">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--destructive))]/12 text-[hsl(var(--destructive))]" aria-hidden="true">
            <Trash2 className="h-5 w-5" />
          </span>
          <div className="min-w-0 space-y-1.5">
            <DialogTitle>Eliminar empresa</DialogTitle>
            <DialogDescription>Esta acción suspende «{name}» y programa su borrado definitivo.</DialogDescription>
          </div>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-6 py-5">
        <ul className="space-y-3">
          {CONSEQUENCES.map(({ icon: Icon, text }) => <li key={text} className="flex items-start gap-3 text-sm text-[hsl(var(--muted-foreground))]">
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-[hsl(var(--foreground))]" />
            <span>{text}</span>
          </li>)}
        </ul>
        <div className="rounded-xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/30 p-4">
          <CheckboxField
            id="company-deletion-notify"
            checked={notifyMembers}
            onChange={e => setNotifyMembers(e.target.checked)}
            label="Avisar por correo a los miembros de la empresa"
            hint="Opcional. Les indicamos la fecha límite para que puedan respaldar su información por su cuenta."
          />
          {notifyMembers && <p className="mt-3 flex items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
            <MailCheck className="h-3.5 w-3.5 shrink-0" /> Se enviará un correo a cada miembro activo al confirmar.
          </p>}
        </div>
        <div className="space-y-4">
          <TextField label={`Escribe «${name}» para confirmar`} value={confirmation} onChange={e => setConfirmation(e.target.value)} autoComplete="off" placeholder={name} />
          <TextField label="Confirma tu contraseña" type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="current-password" />
        </div>
        {schedule.error && <ErrorState title="No se pudo programar la eliminación" description={schedule.error.message} />}
      </div>
      <DialogFooter className="mt-0 shrink-0 gap-2 border-t border-[hsl(var(--border))] px-6 py-4 sm:gap-3">
        <Button variant="outline" onClick={() => close(false)} disabled={schedule.isPending}>Cancelar</Button>
        <Button variant="destructive" loading={schedule.isPending} disabled={!ready} onClick={() => schedule.mutate(activeCompany.id)}>Suspender y programar eliminación</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}

// Danger zone, placed at the bottom of the company profile.
export function CompanyDeletionPanel() {
  const { isAdmin } = useDeletionJobs()
  const [open, setOpen] = useState(false)
  if (!isAdmin) return null
  return <Card className="border-destructive/40 p-6">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0 max-w-2xl space-y-1">
        <h3 className="text-sm font-semibold text-[hsl(var(--destructive))]">Zona de peligro</h3>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Eliminar esta empresa suspende el acceso de todos sus miembros. Podrás recuperarla durante 72 horas; después se borrarán sus datos de forma definitiva.</p>
      </div>
      <Button variant="outline" className="border-destructive/50 text-destructive hover:bg-destructive/10" onClick={() => setOpen(true)}>Eliminar esta empresa</Button>
    </div>
    <ScheduleDeletionDialog open={open} onOpenChange={setOpen} />
  </Card>
}
