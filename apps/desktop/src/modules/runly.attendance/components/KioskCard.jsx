import { useState } from 'react'
import { Link2, MonitorSmartphone, Pencil, RotateCcw, ShieldOff } from 'lucide-react'
import { Button, TextField } from '@runly/ui'
import { KIOSK_MODE_OPTIONS, formatDateTime } from '../lib/attendanceLabels.js'
import { KioskStatusBadge } from './KioskStatusChips.jsx'

const MODE_LABELS = Object.fromEntries(KIOSK_MODE_OPTIONS.map((o) => [o.value, o.label]))

export function KioskCard({ kiosk, siteName, canConfigure, approving, onApprove, onEdit, onLink, onReset, onRevoke }) {
  const [code, setCode] = useState('')
  const revoked = Boolean(kiosk.revokedAt)
  return (
    <div className="flex flex-col gap-3 rounded-2xl surface-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-600/10 text-teal-600"><MonitorSmartphone className="h-5 w-5" /></div>
          <div className="min-w-0">
            <p className="truncate font-semibold">{kiosk.name}</p>
            <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{siteName || 'Sin sitio'} · {MODE_LABELS[kiosk.mode] ?? kiosk.mode}</p>
          </div>
        </div>
        <KioskStatusBadge kiosk={kiosk} />
      </div>
      <p className="text-xs text-[hsl(var(--muted-foreground))]">
        Última señal: {formatDateTime(kiosk.lastSeenAt)}{kiosk.pairingLabel ? ` · ${kiosk.pairingLabel}` : ''}
      </p>

      {kiosk.pairingPending && canConfigure ? (
        <div className="space-y-2 rounded-xl border border-amber-500/40 bg-amber-500/5 p-3">
          <p className="text-sm font-medium">Un dispositivo solicita emparejarse</p>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Escribe el código que se muestra en la pantalla del dispositivo.</p>
          <div className="flex items-end gap-2">
            <TextField className="font-mono tracking-widest" aria-label="Código de emparejamiento" placeholder="Código" value={code} onChange={(e) => setCode(e.target.value)} />
            <Button disabled={!code.trim() || approving} onClick={() => onApprove(kiosk, code.trim())}>{approving ? 'Aprobando…' : 'Aprobar'}</Button>
          </div>
        </div>
      ) : null}

      <div className="mt-auto flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={() => onLink(kiosk)}><Link2 className="h-4 w-4" />Enlace</Button>
        {canConfigure ? (
          <>
            <Button variant="outline" size="sm" onClick={() => onEdit(kiosk)}><Pencil className="h-4 w-4" />Editar</Button>
            <Button variant="outline" size="sm" onClick={() => onReset(kiosk)}><RotateCcw className="h-4 w-4" />Restablecer</Button>
            {!revoked ? <Button variant="outline" size="sm" onClick={() => onRevoke(kiosk)}><ShieldOff className="h-4 w-4" />Revocar</Button> : null}
          </>
        ) : null}
      </div>
    </div>
  )
}
