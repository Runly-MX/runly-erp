import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ExternalLink, Link2, Unlink, UserCheck, X } from 'lucide-react'
import { Button, ConfirmDialog, PersonAvatar, Skeleton, TextField } from '@runly/ui'
import { PersonPhotoAvatar } from './PersonPhotoAvatar.jsx'
import { ToneBadge } from './shared.jsx'
import { useHrSuggestions, useLinkHr, useUnlinkHr } from '../hooks/useAttendanceData.js'

export const hrName = (hr) => hr?.fullName || [hr?.firstName, hr?.lastName].filter(Boolean).join(' ') || hr?.employeeCode || 'Empleado'
const hrRole = (hr) => [hr?.jobTitle, hr?.department].filter(Boolean).join(' · ')
export const hrExpedienteUrl = (id) => `/app/m/runly.hr/hr/employees/${id}`

function useDebounced(value, ms = 250) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return debounced
}

const toRows = (data) => (Array.isArray(data) ? data : (data?.rows ?? data?.items ?? data?.data ?? []))

// Suggestions of HR employees matching `query` (debounced, >= 2 chars). Renders nothing until
// there is something to show.
export function HrSuggestions({ query, onPick, busyId, title = 'Sugerencias de RH' }) {
  const debounced = useDebounced((query ?? '').trim(), 250)
  const suggestions = useHrSuggestions(debounced)
  if (debounced.length < 2) return null
  const rows = toRows(suggestions.data)
  if (!suggestions.isLoading && rows.length === 0) return null
  return (
    <div className="space-y-2 rounded-xl border border-teal-600/25 bg-teal-600/5 p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-teal-700 dark:text-teal-400">{title}</p>
      {suggestions.isLoading ? <Skeleton className="h-12 rounded-lg" /> : (
        <ul className="space-y-1">
          {rows.map((hr) => {
            const linked = Boolean(hr.linkedPersonId)
            return (
              <li key={hr.id} className="flex flex-wrap items-center gap-3 rounded-lg bg-[hsl(var(--background))] p-2 sm:flex-nowrap">
                <PersonAvatar name={hrName(hr)} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{hrName(hr)}</p>
                  <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">
                    <span className="tabular-nums">{hr.employeeCode || 'Sin código'}</span>{hrRole(hr) ? ` · ${hrRole(hr)}` : ''}
                  </p>
                  {hr.userProfileId ? <ToneBadge tone="blue" className="mt-1">Usuario interno de Runly</ToneBadge> : null}
                </div>
                <Button
                  type="button" size="sm" variant="outline" className="max-sm:min-h-11 max-sm:w-full"
                  disabled={linked || busyId === hr.id} onClick={() => onPick(hr)}
                >
                  {linked ? 'Ya vinculado' : <><Link2 className="h-4 w-4" />Vincular</>}
                </Button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// Chip shown in the create form once an HR employee was chosen (draft only, nothing saved yet).
export function HrLinkedChip({ hr, onClear }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-teal-600/30 bg-teal-600/10 p-2 pr-3">
      <PersonAvatar name={hrName(hr)} size="md" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{hrName(hr)}</p>
        <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">Se vinculará con RH al guardar{hr.employeeCode ? ` · ${hr.employeeCode}` : ''}</p>
      </div>
      <Button type="button" variant="ghost" size="sm" className="max-sm:h-11 max-sm:w-11" aria-label="Quitar vínculo con RH" onClick={onClear}><X className="h-4 w-4" /></Button>
    </div>
  )
}

// Edit-mode panel: shows the linked HR employee (with unlink) or a search box to link one.
export function HrLinkPanel({ person, canManage }) {
  const link = useLinkHr(), unlink = useUnlinkHr()
  const [query, setQuery] = useState('')
  const [confirm, setConfirm] = useState(false)
  const hr = person?.hr ?? null
  useEffect(() => { setQuery(''); setConfirm(false) }, [person?.id])

  async function pick(employee) {
    try { await link.mutateAsync({ personId: person.id, hrEmployeeId: employee.id, syncProfile: false }); setQuery('') } catch { /* toast */ }
  }
  async function doUnlink() {
    try { await unlink.mutateAsync(person.id); setConfirm(false) } catch { /* toast */ }
  }

  return (
    <div className="space-y-3 rounded-xl border border-[hsl(var(--border))] p-3">
      <div className="flex items-center gap-2">
        <UserCheck className="h-4 w-4 text-teal-600" aria-hidden="true" />
        <p className="text-sm font-semibold">Vínculo con RH</p>
      </div>
      {hr ? (
        <>
          <div className="flex items-start gap-3">
            <PersonPhotoAvatar person={person} name={hrName(hr)} size="lg" />
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="truncate text-sm font-semibold">{hrName(hr)}</p>
              <p className="truncate text-xs text-[hsl(var(--muted-foreground))]"><span className="tabular-nums">{hr.employeeCode || 'Sin código'}</span>{hrRole(hr) ? ` · ${hrRole(hr)}` : ''}</p>
              {hr.userProfileId ? <p className="text-xs text-teal-700 dark:text-teal-400">Misma identidad que el usuario {hr.userDisplayName || 'de Runly'}</p> : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" size="sm" className="max-sm:min-h-11">
              <Link to={hrExpedienteUrl(hr.id)}><ExternalLink className="h-4 w-4" />Abrir expediente</Link>
            </Button>
            {canManage ? <Button type="button" variant="outline" size="sm" className="max-sm:min-h-11" onClick={() => setConfirm(true)}><Unlink className="h-4 w-4" />Desvincular</Button> : null}
          </div>
        </>
      ) : canManage ? (
        <>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Sin vínculo. Busca al empleado en Recursos Humanos para compartir su identidad.</p>
          <TextField aria-label="Buscar empleado en RH" placeholder="Buscar por nombre o código…" value={query} onChange={(e) => setQuery(e.target.value)} />
          <HrSuggestions query={query} onPick={pick} busyId={link.isPending ? link.variables?.hrEmployeeId : null} title="Empleados de RH" />
        </>
      ) : <p className="text-xs text-[hsl(var(--muted-foreground))]">Esta persona no está vinculada con Recursos Humanos.</p>}

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        title="Desvincular de RH"
        description="La persona seguirá existiendo en Asistencia, pero dejará de compartir identidad con el expediente de RH."
        detail={hr ? hrName(hr) : undefined}
        confirmLabel="Desvincular"
        loading={unlink.isPending}
        onConfirm={doUnlink}
      />
    </div>
  )
}
