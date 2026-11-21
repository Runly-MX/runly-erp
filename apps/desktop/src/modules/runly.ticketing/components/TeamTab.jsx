import { useState } from 'react'
import { Button, ConfirmDialog, EmptyState, PersonAvatar, SectionCard, SelectField, Skeleton, UserSearchModal } from '@runly/ui'
import { ShieldCheck, Trash2, UserPlus } from 'lucide-react'
import { useAuth } from '../../../auth/AuthProvider.jsx'
import { useActiveCompany } from '../../../company/ActiveCompanyProvider'
import { getApiUrl } from '../../../lib/runtimeConfig.js'
import { runly } from '../../../lib/runly.js'
import { useMembers, useTicketingMutation } from '../hooks/useTicketing.js'
import { MUTED, ROLE, ROLE_HINT, optionsOf } from '../lib/ticketingLabels.js'

const ROLES = optionsOf(ROLE)

// Who works this event: admins configure it, agents sell and cancel, viewers consult.
// Check-in permission (ticketing.checkin) is granted by company role, not here.
export function TeamTab({ event, canEdit }) {
  const { session } = useAuth()
  const { activeCompanyId } = useActiveCompany()
  const members = useMembers(event.id)
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(null)
  const set = useTicketingMutation((t, { userId, role }) => runly.ticketing.setMember(event.id, userId, role, t), { success: 'Equipo actualizado.' })
  const remove = useTicketingMutation((t, userId) => runly.ticketing.removeMember(event.id, userId, t), { success: 'Persona quitada del evento.' })
  return (
    <SectionCard title="Equipo del evento" icon={ShieldCheck} description="Administradores configuran el evento; agentes emiten, cobran y cancelan; lectores consultan órdenes y asistentes."
      action={canEdit ? <Button type="button" variant="outline" size="sm" onClick={() => setAdding(true)}><UserPlus />Agregar persona</Button> : null}>
      {members.isPending ? <Skeleton className="h-24 w-full" /> : !members.data?.length ? <EmptyState icon={ShieldCheck} title="Sin integrantes" /> : (
        <ul className="divide-y divide-[hsl(var(--border))]">
          {members.data.map((m) => (
            <li key={m.userId} className="flex flex-wrap items-center gap-3 py-2.5">
              <PersonAvatar name={m.displayName} className="h-9 w-9" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{m.displayName}</p>
                <p className={MUTED}>{ROLE_HINT[m.role]}</p>
              </div>
              {canEdit ? (
                <div className="flex items-center gap-1">
                  <SelectField aria-label={`Rol de ${m.displayName}`} className="w-40" options={ROLES} value={m.role} onValueChange={(role) => role !== m.role && set.mutate({ userId: m.userId, role })} />
                  <Button type="button" variant="ghost" size="icon" className="h-11 w-11" aria-label={`Quitar a ${m.displayName}`} onClick={() => setRemoving(m)}><Trash2 /></Button>
                </div>
              ) : <span className="text-sm">{ROLE[m.role]}</span>}
            </li>
          ))}
        </ul>
      )}
      {adding ? (
        <UserSearchModal open onClose={() => setAdding(false)} roles={ROLES} excludeIds={(members.data ?? []).map((m) => m.userId)} apiBase={getApiUrl()} token={session?.access_token} companyId={activeCompanyId}
          title="Agregar al evento" description="Personas de esta empresa." onConfirm={(userId, role) => set.mutate({ userId, role })} />
      ) : null}
      <ConfirmDialog open={Boolean(removing)} onOpenChange={(v) => !v && setRemoving(null)} title={`Quitar a ${removing?.displayName ?? ''}`}
        description="Deja de ver y operar este evento." confirmLabel="Quitar" loading={remove.isPending}
        onConfirm={async () => { await remove.mutateAsync(removing.userId).catch(() => {}); setRemoving(null) }} />
    </SectionCard>
  )
}
