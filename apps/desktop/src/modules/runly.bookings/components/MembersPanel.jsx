import { useState } from 'react'
import { Button, ConfirmDialog, EmptyState, PersonAvatar, SectionCard, SelectField, Skeleton, UserSearchModal } from '@runly/ui'
import { ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { runly } from '../../../lib/runly.js'
import { useBookingsMutation, useMembers } from '../hooks/useBookings.js'
import { MUTED_TEXT, ROLE, ROLE_HINT, optionsOf } from '../lib/bookingsLabels.js'

const ROLE_OPTIONS = optionsOf(ROLE)

// Who works in this space and with which role. Adding someone also gives them
// access to Reservaciones; removing them from their last space takes it away.
export function MembersPanel({ space, canEdit }) {
  const { session } = useAuth()
  const { activeCompanyId } = useActiveCompany()
  const members = useMembers(space.id)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(null)
  const setRole = useBookingsMutation((t, { userId, role }) => runly.bookings.setMember(space.id, userId, role, t), { success: 'Rol actualizado.' })
  const remove = useBookingsMutation((t, userId) => runly.bookings.removeMember(space.id, userId, t), { success: 'Persona quitada del sistema.' })
  const add = useBookingsMutation((t, { userId, role }) => runly.bookings.setMember(space.id, userId, role, t), { success: 'Persona agregada al sistema.' })

  return (
    <SectionCard
      title="Equipo del sistema"
      description="Administradores configuran y operan; agentes operan reservaciones; lectores solo consultan."
      icon={ShieldCheck}
      action={canEdit ? <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}><UserPlus />Agregar persona</Button> : null}
    >
      {members.isLoading ? <Skeleton className="h-24 w-full" /> : !members.data?.length ? (
        <EmptyState icon={ShieldCheck} title="Sin integrantes" />
      ) : (
        <ul className="divide-y divide-[hsl(var(--border))]">
          {members.data.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 py-2.5">
              <PersonAvatar name={m.displayName} className="h-9 w-9" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.displayName}</p>
                <p className={MUTED_TEXT}>{ROLE_HINT[m.role]}</p>
              </div>
              {canEdit ? (
                <div className="flex items-center gap-1">
                  <SelectField aria-label={`Rol de ${m.displayName}`} className="w-40" options={ROLE_OPTIONS} value={m.role} onValueChange={(role) => role !== m.role && setRole.mutate({ userId: m.userId, role })} />
                  <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label={`Quitar a ${m.displayName}`} onClick={() => setRemoving(m)}><Trash2 /></Button>
                </div>
              ) : <span className="text-sm">{ROLE[m.role]}</span>}
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <UserSearchModal
          open={adding}
          onClose={() => setAdding(false)}
          roles={ROLE_OPTIONS}
          excludeIds={(members.data ?? []).map((m) => m.userId)}
          apiBase={getApiUrl()}
          token={session?.access_token}
          companyId={activeCompanyId}
          onConfirm={async (userId, role) => { await add.mutateAsync({ userId, role }).catch(() => {}); setAdding(false) }}
        />
      ) : null}
      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(v) => !v && setRemoving(null)}
        title={`Quitar a ${removing?.displayName ?? ''}`}
        description="Deja de ver y operar este sistema. Si no pertenece a otro, también pierde el acceso a Reservaciones."
        confirmLabel="Quitar"
        loading={remove.isPending}
        onConfirm={async () => { await remove.mutateAsync(removing.userId).catch(() => {}); setRemoving(null) }}
      />
    </SectionCard>
  )
}
