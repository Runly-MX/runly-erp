import { useMemo, useState } from 'react'
import { Check, ClipboardCheck, X } from 'lucide-react'
import {
  Badge, Button, ChipTabPanel, ChipTabs, DataTable, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, TextField,
} from '@runly/ui'
import { PersonCell } from '../components/PersonCell.jsx'
import { PageShell, ScreenHeader, ToneBadge } from '../components/shared.jsx'
import { useAttendancePermissions, useCorrections, useResolveCorrection } from '../hooks/useAttendanceData.js'
import { usePersistedTab } from '../hooks/usePersistedTab.js'
import { CORRECTION_STATUS_LABELS, DIRECTION_LABELS, correctionStatusTone, formatDateTime, fullName } from '../lib/attendanceLabels.js'

const VIEW_MODES = ['table', 'cards']
const TAB_VALUES = ['pending', 'approved', 'rejected']
const EMPTY = {
  pending: ['Sin solicitudes pendientes', 'Cuando alguien pida registrar una checada olvidada desde su teléfono aparecerá aquí.'],
  approved: ['Sin solicitudes aprobadas', 'Las solicitudes que apruebes se muestran aquí.'],
  rejected: ['Sin solicitudes rechazadas', 'Las solicitudes que rechaces se muestran aquí.'],
}

const DirectionBadge = ({ direction }) => <Badge variant={direction === 'in' ? 'success' : 'secondary'}>{DIRECTION_LABELS[direction] ?? direction}</Badge>

// Approve / reject dialog with an optional note; Enter submits.
function ResolveDialog({ target, onClose }) {
  const resolve = useResolveCorrection()
  const [note, setNote] = useState('')
  const approving = target?.status === 'approved'
  async function submit(event) {
    event.preventDefault()
    try {
      await resolve.mutateAsync({ id: target.item.id, status: target.status, note: note.trim() || undefined })
      onClose()
    } catch { /* toast shown */ }
  }
  return (
    <Dialog open={Boolean(target)} onOpenChange={(open) => { if (!open) { onClose(); setNote('') } }}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>{approving ? 'Aprobar solicitud' : 'Rechazar solicitud'}</DialogTitle>
            <DialogDescription>
              {target ? `${fullName(target.item.person)} · ${DIRECTION_LABELS[target.item.direction] ?? ''} · ${formatDateTime(target.item.occurredAt)}` : ''}
              {approving ? ' Se creará la checada con la marca "Solicitada por la persona".' : ''}
            </DialogDescription>
          </DialogHeader>
          <TextField label="Nota (opcional)" value={note} onChange={(e) => setNote(e.target.value)} autoFocus placeholder={approving ? 'Ej. Confirmado con el supervisor' : 'Ej. No coincide con el turno'} />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>Cancelar</Button>
            <Button type="submit" variant={approving ? 'default' : 'destructive'} disabled={resolve.isPending}>{resolve.isPending ? 'Guardando…' : approving ? 'Aprobar' : 'Rechazar'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function RequestsList({ status, query, canResolve, onResolve }) {
  const columns = useMemo(() => [
    { id: 'person', header: 'Persona', accessorFn: (r) => `${r.person?.code ?? ''} ${fullName(r.person)}`, cell: ({ row }) => <PersonCell person={row.original.person} /> },
    { id: 'direction', header: 'Tipo', accessorFn: (r) => DIRECTION_LABELS[r.direction] ?? r.direction, cell: ({ row }) => <DirectionBadge direction={row.original.direction} /> },
    { id: 'occurredAt', header: 'Checada solicitada', accessorFn: (r) => r.occurredAt, cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(row.original.occurredAt)}</span> },
    { id: 'reason', header: 'Motivo', accessorFn: (r) => r.reason ?? '', cell: ({ row }) => <span className="line-clamp-2 max-w-sm whitespace-normal">{row.original.reason || '—'}</span> },
    { id: 'requestedAt', header: 'Solicitada', accessorFn: (r) => r.requestedAt, cell: ({ row }) => <span className="whitespace-nowrap tabular-nums text-[hsl(var(--muted-foreground))]">{formatDateTime(row.original.requestedAt)}</span> },
    status === 'pending'
      ? {
        id: 'actions', header: '', enableSorting: false,
        cell: ({ row }) => (canResolve ? (
          <div className="flex justify-end gap-1">
            <Button size="sm" onClick={() => onResolve({ item: row.original, status: 'approved' })}><Check className="h-4 w-4" />Aprobar</Button>
            <Button size="sm" variant="outline" onClick={() => onResolve({ item: row.original, status: 'rejected' })}><X className="h-4 w-4" />Rechazar</Button>
          </div>
        ) : null),
      }
      : { id: 'note', header: 'Nota', accessorFn: (r) => r.resolutionNote ?? '', cell: ({ row }) => row.original.resolutionNote || '—' },
  ], [status, canResolve, onResolve])

  return (
    <DataTable
      columns={columns}
      data={query.data?.data ?? []}
      getRowId={(r) => r.id}
      isLoading={query.isLoading}
      isError={query.isError}
      onRetry={() => query.refetch()}
      pageSize={15}
      searchPlaceholder="Buscar solicitud…"
      viewModes={VIEW_MODES}
      viewStorageKey="attendance-requests"
      renderCard={(r) => (
        <div className="flex h-full flex-col gap-3 rounded-2xl surface-card p-4">
          <div className="flex items-start justify-between gap-2">
            <PersonCell person={r.person} size="md" />
            <DirectionBadge direction={r.direction} />
          </div>
          <p className="text-sm font-medium tabular-nums">{formatDateTime(r.occurredAt)}</p>
          <p className="text-sm">{r.reason || 'Sin motivo.'}</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Solicitada el {formatDateTime(r.requestedAt)}</p>
          {status === 'pending' ? (canResolve ? (
            <div className="mt-auto flex flex-wrap justify-end gap-2">
              <Button size="sm" onClick={() => onResolve({ item: r, status: 'approved' })}><Check className="h-4 w-4" />Aprobar</Button>
              <Button size="sm" variant="outline" onClick={() => onResolve({ item: r, status: 'rejected' })}><X className="h-4 w-4" />Rechazar</Button>
            </div>
          ) : null) : (
            <div className="mt-auto flex flex-wrap items-center gap-2 text-xs text-[hsl(var(--muted-foreground))]">
              <ToneBadge tone={correctionStatusTone(r.status)}>{CORRECTION_STATUS_LABELS[r.status]}</ToneBadge>
              {r.resolutionNote ? <span>{r.resolutionNote}</span> : null}
            </div>
          )}
        </div>
      )}
      emptyIcon={ClipboardCheck}
      emptyTitle={EMPTY[status][0]}
      emptyDescription={EMPTY[status][1]}
    />
  )
}

export default function AttendanceRequests() {
  const { canManagePunches } = useAttendancePermissions()
  const [tab, setTab] = usePersistedTab('attendance.requests.tab', TAB_VALUES, 'pending')
  const [target, setTarget] = useState(null)
  const queries = { pending: useCorrections('pending'), approved: useCorrections('approved'), rejected: useCorrections('rejected') }
  const countOf = (status) => queries[status].data?.data?.length
  const tabs = [
    { value: 'pending', label: 'Pendientes', icon: ClipboardCheck, badge: queries.pending.data?.meta?.pending ?? countOf('pending'), description: 'Checadas olvidadas que las personas pidieron registrar desde su teléfono. Al aprobar una se crea la checada con la marca "Solicitada por la persona".' },
    { value: 'approved', label: 'Aprobadas', icon: Check, badge: countOf('approved'), description: 'Solicitudes aprobadas; su checada ya cuenta en las horas.' },
    { value: 'rejected', label: 'Rechazadas', icon: X, badge: countOf('rejected'), description: 'Solicitudes rechazadas; no generaron ninguna checada.' },
  ]
  return (
    <PageShell>
      <ScreenHeader title="Solicitudes" description="Checadas olvidadas que el personal pide registrar desde su teléfono. Apruébalas o recházalas con una nota." />
      <ChipTabs tabs={tabs} value={tab} onChange={setTab} tone="teal" ariaLabel="Estado de las solicitudes" />
      {TAB_VALUES.map((status) => (
        <ChipTabPanel key={status} value={status} active={tab === status}>
          <RequestsList status={status} query={queries[status]} canResolve={canManagePunches} onResolve={setTarget} />
        </ChipTabPanel>
      ))}
      <ResolveDialog key={target ? `${target.item.id}-${target.status}` : 'none'} target={target} onClose={() => setTarget(null)} />
    </PageShell>
  )
}
