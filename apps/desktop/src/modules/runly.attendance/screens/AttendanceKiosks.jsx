import { useState } from 'react'
import { MonitorSmartphone, Plus } from 'lucide-react'
import { Button, ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, EmptyState, ErrorState, PageHeader } from '@runly/ui'
import { KioskCard } from '../components/KioskCard.jsx'
import { KioskSheet } from '../components/KioskSheet.jsx'
import { CardSkeletons, LinkBlock, PageShell } from '../components/shared.jsx'
import {
  useApproveKiosk, useAttendancePermissions, useKiosks, useResetKiosk, useRevokeKiosk,
} from '../hooks/useAttendanceData.js'
import { useLookups } from '../hooks/useLookups.js'
import { kioskLink } from '../lib/attendanceLabels.js'

export default function AttendanceKiosks() {
  const kiosks = useKiosks({ refetchInterval: 20_000 })
  const lookups = useLookups()
  const { canConfigure } = useAttendancePermissions()
  const approve = useApproveKiosk(), reset = useResetKiosk(), revoke = useRevokeKiosk()
  const [sheet, setSheet] = useState({ open: false, kiosk: null })
  const [linkKiosk, setLinkKiosk] = useState(null)
  const [confirm, setConfirm] = useState(null) // { type: 'reset' | 'revoke', kiosk }

  const rows = kiosks.data ?? []
  const confirmCopy = {
    reset: { title: 'Restablecer kiosko', description: 'Se olvidará el dispositivo emparejado y se generará un enlace nuevo. El dispositivo deberá emparejarse de nuevo.', label: 'Restablecer', run: reset },
    revoke: { title: 'Revocar kiosko', description: 'El dispositivo dejará de poder registrar checadas de inmediato.', label: 'Revocar', run: revoke },
  }[confirm?.type ?? 'reset']

  async function runConfirm() {
    try { await confirmCopy.run.mutateAsync(confirm.kiosk.id); setConfirm(null) } catch { /* toast shown */ }
  }

  return (
    <PageShell>
      <PageHeader
        eyebrow="Asistencia"
        title="Kioskos"
        description="Dispositivos donde el personal marca entradas y salidas. Abre el enlace en la tableta y aprueba el emparejamiento aquí."
        actions={canConfigure ? <Button onClick={() => setSheet({ open: true, kiosk: null })}><Plus className="h-4 w-4" />Nuevo kiosko</Button> : null}
      />

      {kiosks.isLoading ? <CardSkeletons count={3} className="h-48" /> : kiosks.isError ? (
        <ErrorState onRetry={() => kiosks.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={MonitorSmartphone}
          title="Aún no hay kioskos"
          description="Crea un kiosko, abre su enlace en una tableta y apruébalo con el código que muestre."
          action={canConfigure ? { label: 'Nuevo kiosko', onClick: () => setSheet({ open: true, kiosk: null }) } : undefined}
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((kiosk) => (
            <KioskCard
              key={kiosk.id}
              kiosk={kiosk}
              siteName={lookups.sites.get(kiosk.siteId)}
              canConfigure={canConfigure}
              approving={approve.isPending && approve.variables?.id === kiosk.id}
              onApprove={(k, code) => approve.mutate({ id: k.id, code })}
              onEdit={(k) => setSheet({ open: true, kiosk: k })}
              onLink={setLinkKiosk}
              onReset={(k) => setConfirm({ type: 'reset', kiosk: k })}
              onRevoke={(k) => setConfirm({ type: 'revoke', kiosk: k })}
            />
          ))}
        </div>
      )}

      <KioskSheet open={sheet.open} onOpenChange={(open) => setSheet((s) => ({ ...s, open }))} kiosk={sheet.kiosk} lookups={lookups} />

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
