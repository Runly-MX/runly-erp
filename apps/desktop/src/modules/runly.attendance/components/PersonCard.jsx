import { Link } from 'react-router-dom'
import { CreditCard, KeyRound, Link2, Pencil, Smartphone } from 'lucide-react'
import { Badge, Button } from '@runly/ui'
import { KIND_LABELS, fullName } from '../lib/attendanceLabels.js'
import { hrExpedienteUrl, hrName } from './HrLinkPanel.jsx'
import { PersonPhotoAvatar } from './PersonPhotoAvatar.jsx'
import { ToneBadge } from './shared.jsx'

export const KIND_TONES = { internal: 'teal', contractor: 'amber', visitor: 'violet' }
const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'

// Access summary chips (PIN, cards, phone, pending invitation) shared by the table and card views.
export function AccessChips({ person }) {
  const p = person
  const cards = (p.credentials ?? []).filter((c) => c.type === 'card').length
  const phones = (p.credentials ?? []).length - cards
  return (
    <div className="flex flex-wrap gap-1">
      {p.hasPin ? <ToneBadge tone="blue" icon={KeyRound}>PIN</ToneBadge> : null}
      {cards ? <ToneBadge tone="violet" icon={CreditCard}>{cards} tarjeta{cards > 1 ? 's' : ''}</ToneBadge> : null}
      {phones ? <ToneBadge tone="teal" icon={Smartphone}>Teléfono</ToneBadge> : null}
      {p.enrollPending ? <ToneBadge tone="amber">Invitación pendiente</ToneBadge> : null}
      {!p.hasPin && !(p.credentials ?? []).length && !p.enrollPending ? <span className={MUTED}>Sin credenciales</span> : null}
    </div>
  )
}

export function HrBadge({ hr }) {
  if (!hr) return <span className={MUTED}>—</span>
  return (
    <Link to={hrExpedienteUrl(hr.id)} title={`Abrir expediente de ${hrName(hr)}`} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600">
      <ToneBadge tone="teal" icon={Link2}>{hr.employeeCode || 'RH'}</ToneBadge>
    </Link>
  )
}

export function PersonCard({ person, lookups, canManage, onCredentials, onEdit }) {
  const inactive = person.enabled === false
  const meta = [person.groupName ?? lookups.groups.get(person.groupId), person.categoryName ?? lookups.categories.get(person.categoryId), person.shiftName ?? lookups.shifts.get(person.shiftId)].filter(Boolean).join(' · ')
  return (
    <div className="flex h-full flex-col gap-3 rounded-2xl surface-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <PersonPhotoAvatar person={person} name={fullName(person)} size="md" />
          <div className="min-w-0">
            <p className="truncate font-semibold leading-tight">{fullName(person)}</p>
            <p className={`${MUTED} tabular-nums`}>{person.code}</p>
          </div>
        </div>
        <Badge variant={inactive ? 'secondary' : 'success'}>{inactive ? 'Inactivo' : 'Activo'}</Badge>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <ToneBadge tone={KIND_TONES[person.kind] ?? 'slate'}>{KIND_LABELS[person.kind] ?? person.kind}</ToneBadge>
        <HrBadge hr={person.hr} />
      </div>
      {meta ? <p className="truncate text-sm text-[hsl(var(--muted-foreground))]">{meta}</p> : null}
      <AccessChips person={person} />
      <div className="mt-auto flex justify-end gap-1">
        <Button variant="ghost" size="sm" className="max-sm:h-11 max-sm:w-11" aria-label="Credenciales" onClick={() => onCredentials(person.id)}><KeyRound className="h-4 w-4" /></Button>
        {canManage ? <Button variant="ghost" size="sm" className="max-sm:h-11 max-sm:w-11" aria-label="Editar" onClick={() => onEdit(person.id)}><Pencil className="h-4 w-4" /></Button> : null}
      </div>
    </div>
  )
}
