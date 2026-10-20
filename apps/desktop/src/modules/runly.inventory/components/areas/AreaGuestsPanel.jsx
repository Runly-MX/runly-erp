import { useState } from 'react'
import { Badge, Button, ConfirmDialog, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger, EmptyState, ErrorState, PersonAvatar, Skeleton } from '@runly/ui'
import { Ban, FolderMinus, MoreHorizontal, Send, Truck } from 'lucide-react'
import { toast } from 'sonner'
import { useInventoryAreaGuests, useRemoveInventoryAreaGuest, useResendInventoryGuest, useRevokeInventoryGuest } from '../../hooks/useInventoryAreas.js'
import { GUEST_ROLE_LABEL, guestStatusLabel, guestStatusVariant } from '../../lib/guest-session.js'
import { GuestInviteDialog } from './GuestInviteDialog.jsx'
import { GuestLinkDialog } from './GuestLinkDialog.jsx'

const fmt = (iso) => {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
}

function lastSeenText(guest) {
  const seen = fmt(guest.lastSeenAt)
  if (seen) return `Último acceso: ${seen}`
  const sent = fmt(guest.sentAt)
  return sent ? `Invitado el ${sent}` : 'Sin accesos'
}

// "Proveedores" tab of the members sheet: guests invited by email to this area.
export function AreaGuestsPanel({ area, inviteOpen, onInviteOpenChange }) {
  const guests = useInventoryAreaGuests(area?.id)
  const resend = useResendInventoryGuest()
  const revoke = useRevokeInventoryGuest()
  const remove = useRemoveInventoryAreaGuest(area?.id)
  const [result, setResult] = useState(null)
  const [revokeTarget, setRevokeTarget] = useState(null)
  const [removeTarget, setRemoveTarget] = useState(null)
  const rows = guests.data ?? []

  async function handleResend(guest) {
    try { setResult(await resend.mutateAsync({ guestId: guest.id })) } catch (err) { toast.error(err?.message ?? 'No se pudo reenviar la invitación') }
  }
  async function handleRevoke() {
    try { await revoke.mutateAsync(revokeTarget.id); toast.success('Acceso revocado') } catch (err) { toast.error(err?.message ?? 'No se pudo revocar el acceso') }
    setRevokeTarget(null)
  }
  async function handleRemove() {
    try { await remove.mutateAsync(removeTarget.id); toast.success('Proveedor quitado de la carpeta') } catch (err) { toast.error(err?.message ?? 'No se pudo quitar al proveedor') }
    setRemoveTarget(null)
  }

  return (
    <>
      {guests.isLoading ? (
        <Skeleton className="h-16 w-full" />
      ) : guests.isError ? (
        <ErrorState title="No se pudieron cargar los proveedores" description={guests.error?.message} onRetry={() => guests.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState icon={Truck} title="Sin proveedores invitados" description="Invita a un proveedor por correo para que consulte o actualice los items de esta carpeta." />
      ) : rows.map((guest) => (
        <div key={guest.id} className="flex items-center gap-3 rounded-md border border-[hsl(var(--border))] p-3">
          <PersonAvatar name={guest.name || guest.email} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{guest.name || guest.email}</p>
            {guest.name ? <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{guest.email}</p> : null}
            <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{GUEST_ROLE_LABEL[guest.role] ?? guest.role} · {lastSeenText(guest)}</p>
          </div>
          <Badge variant={guestStatusVariant(guest.status)}>{guestStatusLabel(guest.status)}</Badge>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Acciones de ${guest.name || guest.email}`}><MoreHorizontal className="h-4 w-4" /></Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {guest.status !== 'revoked' ? (
                <DropdownMenuItem disabled={resend.isPending} onSelect={() => handleResend(guest)}>
                  <Send className="mr-2 h-4 w-4" />Reenviar invitación
                </DropdownMenuItem>
              ) : null}
              <DropdownMenuItem onSelect={() => setRemoveTarget(guest)}><FolderMinus className="mr-2 h-4 w-4" />Quitar de la carpeta</DropdownMenuItem>
              {guest.status !== 'revoked' ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onSelect={() => setRevokeTarget(guest)}><Ban className="mr-2 h-4 w-4" />Revocar acceso</DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      ))}
      <GuestInviteDialog open={inviteOpen} onOpenChange={onInviteOpenChange} area={area} onInvited={setResult} />
      <GuestLinkDialog result={result} onClose={() => setResult(null)} />
      <ConfirmDialog
        open={Boolean(revokeTarget)} onOpenChange={(v) => { if (!v) setRevokeTarget(null) }}
        title="Revocar acceso" description="Perderá el acceso a todas las carpetas a las que fue invitado y su enlace dejará de funcionar."
        detail={revokeTarget?.name || revokeTarget?.email} confirmLabel="Revocar" loading={revoke.isPending} onConfirm={handleRevoke}
      />
      <ConfirmDialog
        open={Boolean(removeTarget)} onOpenChange={(v) => { if (!v) setRemoveTarget(null) }}
        title="Quitar de la carpeta" description="Dejará de ver los items de esta carpeta. Conserva el acceso a otras carpetas si fue invitado a ellas."
        detail={removeTarget?.name || removeTarget?.email} confirmLabel="Quitar" loading={remove.isPending} onConfirm={handleRemove}
      />
    </>
  )
}
