import { useMemo, useState } from 'react'
import { Link2, MonitorSmartphone, Pencil, Plus, RotateCcw, ShieldCheck, ShieldOff } from 'lucide-react'
import {
  Badge, Button, ConfirmDialog, DataTable, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, TextField,
} from '@runly/ui'
import { KioskCard } from '../components/KioskCard.jsx'
import { KioskSheet } from '../components/KioskSheet.jsx'
import { KioskStatusBadge } from '../components/KioskStatusChips.jsx'
import { LinkBlock, PageShell, ScreenHeader } from '../components/shared.jsx'
import {
  useApproveKiosk, useAttendancePermissions, useKiosks, useResetKiosk, useRevokeKiosk,
} from '../hooks/useAttendanceData.js'
import { useLookups } from '../hooks/useLookups.js'
import { KIOSK_MODE_OPTIONS, formatDateTime, kioskLink, kioskStatus } from '../lib/attendanceLabels.js'

const MODE_LABELS = Object.fromEntries(KIOSK_MODE_OPTIONS.map((o) => [o.value, o.label]))
const STATUS_OPTIONS = [
  { value: 'online', label: 'En línea' },
  { value: 'offline', label: 'Sin conexión' },
  { value: 'pending', label: 'Pendiente de aprobar' },
  { value: 'unpaired', label: 'Sin emparejar' },
  { value: 'revoked', label: 'Revocado' },
]
const VIEW_MODES = ['table', 'cards']

export default function AttendanceKiosks() {
  const kiosks = useKiosks({ refetchInterval: 20_000 })
  const lookups = useLookups()
  const { canConfigure } = useAttendancePermissions()
  const approve = useApproveKiosk(), reset = useResetKiosk(), revoke = useRevokeKiosk()
  const [sheet, setSheet] = useState({ open: false, kiosk: null })
  const [linkKiosk, setLinkKiosk] = useState(null)
  const [confirm, setConfirm] = useState(null) // { type: 'reset' | 'revoke', kiosk }
  const [approveKiosk, setApproveKiosk] = useState(null)
  const [approveCode, setApproveCode] = useState('')

  // Derived fields so DataTable search and filters work on computed values.
  const rows = useMemo(() => (kiosks.data ?? []).map((k) => ({
    ...k, statusKey: kioskStatus(k).key, siteName: lookups.sites.get(k.siteId) ?? '',
  })), [kiosks.data, lookups.sites])
  const pending = rows.filter((k) => k.pairingPending).length
  const filters = useMemo(() => [
    { key: 'statusKey', label: 'Estado', options: STATUS_OPTIONS },
    { key: 'siteId', label: 'Sitio', options: lookups.rows.sites.filter((s) => s.enabled !== false).map((s) => ({ value: s.id, label: s.name })) },
    { key: 'mode', label: 'Modo', options: KIOSK_MODE_OPTIONS },
  ], [lookups.rows.sites])

  const confirmCopy = {
    reset: { title: 'Restablecer kiosko', description: 'Se olvidará el dispositivo emparejado y se generará un enlace nuevo. El dispositivo deberá emparejarse de nuevo.', label: 'Restablecer', run: reset },
    revoke: { title: 'Revocar kiosko', description: 'El dispositivo dejará de poder registrar checadas de inmediato.', label: 'Revocar', run: revoke },
  }[confirm?.type ?? 'reset']

  async function runConfirm() {
    try { await confirmCopy.run.mutateAsync(confirm.kiosk.id); setConfirm(null) } catch { /* toast shown */ }
  }

  async function submitApprove() {
    try { await approve.mutateAsync({ id: approveKiosk.id, code: approveCode.trim() }); setApproveKiosk(null) } catch { /* toast shown */ }
  }

  const openEdit = (k) => setSheet({ open: true, kiosk: k })
  const askReset = (k) => setConfirm({ type: 'reset', kiosk: k })
  const askRevoke = (k) => setConfirm({ type: 'revoke', kiosk: k })

  const columns = useMemo(() => [
    {
      id: 'name', header: 'Nombre', accessorFn: (k) => `${k.name} ${k.siteName}`,
      cell: ({ row }) => (
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-600/10 text-teal-700 dark:text-teal-300"><MonitorSmartphone className="h-4 w-4" aria-hidden="true" /></span>
          <span className="truncate font-medium">{row.original.name}</span>
        </div>
      ),
    },
    { id: 'site', header: 'Sitio', accessorFn: (k) => k.siteName || 'Sin sitio' },
    { id: 'mode', header: 'Modo', accessorFn: (k) => MODE_LABELS[k.mode] ?? k.mode },
    { id: 'status', header: 'Estado', accessorFn: (k) => kioskStatus(k).label, cell: ({ row }) => <KioskStatusBadge kiosk={row.original} /> },
    {
      id: 'lastSeen', header: 'Última señal', accessorFn: (k) => k.lastSeenAt ?? '',
      cell: ({ row }) => <span className="whitespace-nowrap tabular-nums">{formatDateTime(row.original.lastSeenAt)}</span>,
    },
    {
      id: 'actions', header: '', enableSorting: false,
      cell: ({ row }) => {
        const k = row.original
        const btn = 'max-sm:h-11 max-sm:w-11'
        return (
          <div className="flex justify-end gap-1">
            {canConfigure && k.pairingPending ? <Button variant="ghost" size="sm" className={btn} aria-label="Aprobar emparejamiento" title="Aprobar emparejamiento" onClick={() => { setApproveCode(''); setApproveKiosk(k) }}><ShieldCheck className="h-4 w-4" /></Button> : null}
            <Button variant="ghost" size="sm" className={btn} aria-label="Enlace" title="Enlace" onClick={() => setLinkKiosk(k)}><Link2 className="h-4 w-4" /></Button>
            {canConfigure ? (
              <>
                <Button variant="ghost" size="sm" className={btn} aria-label="Editar" title="Editar" onClick={() => openEdit(k)}><Pencil className="h-4 w-4" /></Button>
                <Button variant="ghost" size="sm" className={btn} aria-label="Restablecer" title="Restablecer" onClick={() => askReset(k)}><RotateCcw className="h-4 w-4" /></Button>
                {!k.revokedAt ? <Button variant="ghost" size="sm" className={btn} aria-label="Revocar" title="Revocar" onClick={() => askRevoke(k)}><ShieldOff className="h-4 w-4" /></Button> : null}
              </>
            ) : null}
          </div>
        )
      },
    },
  ], [canConfigure])

  return (
    <PageShell>
      <ScreenHeader title="Kioskos" description="Dispositivos donde el personal marca entradas y salidas." />
      <DataTable
        columns={columns}
        data={rows}
        filters={filters}
        getRowId={(k) => k.id}
        isLoading={kiosks.isLoading}
        isError={kiosks.isError}
        onRetry={() => kiosks.refetch()}
        pageSize={12}
        searchPlaceholder="Buscar por nombre o sitio…"
        viewModes={VIEW_MODES}
        defaultViewMode="cards"
        viewStorageKey="attendance-kiosks"
        renderCard={(kiosk) => (
          <KioskCard
            kiosk={kiosk}
            siteName={kiosk.siteName}
            canConfigure={canConfigure}
            approving={approve.isPending && approve.variables?.id === kiosk.id}
            onApprove={(k, code) => approve.mutate({ id: k.id, code })}
            onEdit={openEdit}
            onLink={setLinkKiosk}
            onReset={askReset}
            onRevoke={askRevoke}
          />
        )}
        toolbarStart={pending ? <Badge variant="warning">{pending} por aprobar</Badge> : null}
        emptyIcon={MonitorSmartphone}
        emptyTitle="Aún no hay kioskos"
        emptyDescription="Crea un kiosko, abre su enlace en una tableta y apruébalo con el código que muestre."
        emptyAction={canConfigure ? { label: 'Nuevo kiosko', onClick: () => setSheet({ open: true, kiosk: null }) } : undefined}
        toolbarActions={canConfigure ? <Button onClick={() => setSheet({ open: true, kiosk: null })}><Plus className="h-4 w-4" />Nuevo kiosko</Button> : null}
      />

      <KioskSheet open={sheet.open} onOpenChange={(open) => setSheet((s) => ({ ...s, open }))} kiosk={sheet.kiosk} lookups={lookups} />

      <Dialog open={Boolean(approveKiosk)} onOpenChange={(open) => !open && setApproveKiosk(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Aprobar emparejamiento</DialogTitle>
            <DialogDescription>{approveKiosk?.name}: escribe el código que se muestra en la pantalla del dispositivo.</DialogDescription>
          </DialogHeader>
          <TextField className="font-mono tracking-widest" aria-label="Código de emparejamiento" placeholder="Código" value={approveCode} onChange={(e) => setApproveCode(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveKiosk(null)}>Cancelar</Button>
            <Button disabled={!approveCode.trim() || approve.isPending} onClick={submitApprove}>{approve.isPending ? 'Aprobando…' : 'Aprobar'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(linkKiosk)} onOpenChange={(open) => !open && setLinkKiosk(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{linkKiosk?.name}</DialogTitle>
            <DialogDescription>Abre este enlace en el dispositivo del kiosko, o escanea el código QR.</DialogDescription>
          </DialogHeader>
          {linkKiosk ? <LinkBlock label="Enlace del kiosko" value={kioskLink(window.location.origin, linkKiosk.linkToken)} /> : null}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(confirm)}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={confirmCopy.title}
        description={confirmCopy.description}
        detail={confirm?.kiosk?.name}
        confirmLabel={confirmCopy.label}
        loading={confirmCopy.run.isPending}
        onConfirm={runConfirm}
      />
    </PageShell>
  )
}
