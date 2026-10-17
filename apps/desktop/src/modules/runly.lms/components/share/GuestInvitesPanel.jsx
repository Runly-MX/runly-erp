import { useState } from 'react'
import {
  Alert, AlertDescription, Badge, Button, ConfirmDialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
  EmptyState, ErrorState, Skeleton, TextareaField,
} from '@runly/ui'
import { Ban, Loader2, MailPlus, MoreHorizontal, Send, Users } from 'lucide-react'
import { toast } from 'sonner'
import { useCreateShareInvites, useResendShareInvite, useRevokeShareInvite, useShareInvites } from '../../hooks/useLmsShare.js'
import { inviteStatusInfo, parseInviteText } from '../../lib/lmsIntake.js'
import { formatShortDate } from '../../lib/lmsLabels.js'
import { InviteCodesDialog } from './InviteCodesDialog.jsx'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'

function activity(invite) {
  if (invite.status === 'revoked') return `Revocado ${formatShortDate(invite.revokedAt)}`
  if (invite.lastUsedAt) return `Último acceso ${formatShortDate(invite.lastUsedAt)}`
  return invite.sentAt ? `Correo enviado ${formatShortDate(invite.sentAt)}` : 'Correo sin enviar'
}

function InviteRow({ invite, disabled, onResend, onRevoke }) {
  const status = inviteStatusInfo(invite.status)
  return (
    <li className="flex items-center gap-3 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{invite.learnerName || invite.name || invite.email}</p>
        <p className={`${MUTED} truncate`}>{invite.learnerName || invite.name ? `${invite.email} · ` : ''}{activity(invite)}</p>
      </div>
      <Badge variant={status.variant} className="shrink-0">{status.label}</Badge>
      {invite.status !== 'revoked' && !disabled ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon-sm" aria-label="Acciones"><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => onResend(invite)}><Send />Reenviar con un código nuevo</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onRevoke(invite)} className="text-[hsl(var(--destructive))]"><Ban />Revocar acceso</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      ) : <span className="w-8 shrink-0" />}
    </li>
  )
}

// "Invitaciones" tab of the share dialog (invite-only links): add people by
// email, see who entered, resend (new code) and revoke.
export function GuestInvitesPanel({ courseId, linkReady, disabled = false }) {
  const invites = useShareInvites(courseId)
  const create = useCreateShareInvites(), resend = useResendShareInvite(), revoke = useRevokeShareInvite()
  const [text, setText] = useState('')
  const [error, setError] = useState(null)
  const [manual, setManual] = useState([])
  const [revokeFor, setRevokeFor] = useState(null)
  const list = invites.data?.invites ?? []
  const busy = disabled || create.isPending || resend.isPending || revoke.isPending

  function report(entries) {
    const unsent = entries.filter((entry) => !entry.sent)
    const sent = entries.length - unsent.length
    if (sent) toast.success(sent === 1 ? 'Invitación enviada.' : `${sent} invitaciones enviadas.`)
    if (unsent.length) setManual(unsent)
  }

  async function submit() {
    const parsed = parseInviteText(text)
    if (parsed.invalid.length) return setError(`Sin correo válido: ${parsed.invalid.slice(0, 3).join(' · ')}${parsed.invalid.length > 3 ? '…' : ''}`)
    if (!parsed.invites.length) return setError('Escribe al menos un correo.')
    setError(null)
    try {
      const result = await create.mutateAsync({ courseId, invites: parsed.invites })
      setText('')
      if (result.skipped?.length) toast.info(`${result.skipped.length} ${result.skipped.length === 1 ? 'correo ya tenía' : 'correos ya tenían'} una invitación vigente.`)
      report(result.created ?? [])
    } catch { /* toast shown by the mutation */ }
  }

  async function doResend(invite) {
    try { report([await resend.mutateAsync({ courseId, inviteId: invite.id })]) } catch { /* toast shown by the mutation */ }
  }

  async function doRevoke() {
    try {
      await revoke.mutateAsync({ courseId, inviteId: revokeFor.id })
      toast.success('Acceso revocado.')
      setRevokeFor(null)
    } catch { /* toast shown by the mutation */ }
  }

  return (
    <div className="space-y-4">
      {!linkReady ? <Alert><AlertDescription>Activa el enlace público en la pestaña Enlace para poder invitar.</AlertDescription></Alert> : null}
      {invites.data && !invites.data.mailConfigured ? (
        <Alert><AlertDescription>El envío de correo no está configurado. Al invitar verás el enlace y el código de cada persona para enviarlos tú.</AlertDescription></Alert>
      ) : null}
      <div className="space-y-2">
        <TextareaField
          label="Invitar por correo" rows={4} value={text} onChange={(event) => setText(event.target.value)} error={error ?? undefined}
          placeholder={'ana@empresa.com\nLeo Ruiz <leo@empresa.com>'} disabled={busy || !linkReady}
          hint="Uno por línea. Puedes agregar el nombre: «Nombre <correo>» o «correo, Nombre». Cada persona recibe su enlace y un código de acceso."
        />
        <div className="flex justify-end">
          <Button onClick={submit} disabled={busy || !linkReady || !text.trim()}>
            {create.isPending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <MailPlus />}Invitar
          </Button>
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Invitados{list.length ? ` (${list.length})` : ''}</p>
        {invites.isLoading ? <Skeleton className="h-24 rounded-md" /> : null}
        {invites.isError ? <ErrorState title="No se pudieron cargar las invitaciones" description={invites.error?.message} onRetry={() => invites.refetch()} /> : null}
        {invites.data && !list.length ? <EmptyState icon={Users} title="Sin invitaciones" description="Las personas que invites aparecerán aquí con su estado y último acceso." /> : null}
        {list.length ? (
          <ul className="divide-y divide-[hsl(var(--border))] rounded-md border border-[hsl(var(--border))]">
            {list.map((invite) => <InviteRow key={invite.id} invite={invite} disabled={busy} onResend={doResend} onRevoke={setRevokeFor} />)}
          </ul>
        ) : null}
      </div>
      <InviteCodesDialog open={manual.length > 0} onOpenChange={(open) => { if (!open) setManual([]) }} items={manual} />
      <ConfirmDialog
        open={Boolean(revokeFor)} onOpenChange={(open) => { if (!open) setRevokeFor(null) }}
        icon={Ban} title="Revocar acceso"
        description={`${revokeFor?.name || revokeFor?.email || 'La persona'} dejará de ver el curso de inmediato y su código ya no funcionará. Su avance se conserva en Alumnos; puedes invitarla de nuevo después.`}
        confirmLabel="Revocar" loading={revoke.isPending} onConfirm={doRevoke}
      />
    </div>
  )
}
