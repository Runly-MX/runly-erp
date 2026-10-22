import { useCallback, useMemo, useState } from 'react'
import { itemLabel } from '../lib/item-label.js'
import { AdvancedFileViewer, Button, Skeleton } from '@runly/ui'
import { FileText, Layers } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../../auth/AuthProvider'
import { runly } from '../../../lib/runly'
import { ADMIN_ACTIONS, ADMIN_STATUS_BY_VALUE, actionsFor, reasonLabel } from '../lib/admin-status.js'
import { useInventoryAdminEvents, useInventoryCan, useOpenDeregistrationAct } from '../hooks/useInventoryAdmin.js'
import { InventoryAdminStatusBadge } from './InventoryAdminStatusBadge.jsx'
import { InventoryAdminTransitionDialog } from './InventoryAdminTransitionDialog.jsx'

const ACTION_LABELS = {
  migrated: 'Baja migrada',
  confirm_registration: 'Alta confirmada',
  propose_deregistration: 'Baja propuesta',
  approve_deregistration: 'Baja autorizada',
  reject_deregistration: 'Propuesta rechazada',
  revert_deregistration: 'Baja revertida',
}

const formatDay = (value) => {
  if (!value) return ''
  const [y, m, d] = String(value).slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}
const formatStamp = (value) => (value ? new Date(value).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' }) : '')

// RunlyDetail "component" section: current administrative status, the
// actions the user may take and the formal record of every alta/baja event.
export default function InventoryDetailAdminSection({ data: item }) {
  const can = useInventoryCan()
  const { data: events, isLoading } = useInventoryAdminEvents(item?.id)
  const [action, setAction] = useState(null)
  const [viewerIndex, setViewerIndex] = useState(null)
  const openAct = useOpenDeregistrationAct()
  const { session } = useAuth()
  const token = session?.access_token
  // Evidence of every event, in history order, so the viewer pages through all of them.
  const evidence = useMemo(() => (events ?? []).filter((e) => e.fileId).map((e) => ({
    id: e.fileId, originalName: e.file?.originalName ?? 'Evidencia', mimeType: e.file?.mimeType ?? null, sizeBytes: e.file?.sizeBytes ?? 0, eventId: e.id,
  })), [events])
  const resolveEvidenceUrl = useCallback(async (file) => {
    const res = await runly.files.getSignedUrl(file.id, token)
    return res?.data?.signedUrl ?? res?.data?.url ?? null
  }, [token])
  if (!item) return null
  const available = actionsFor(item.adminStatus).filter((a) => can(a.permission))
  const status = ADMIN_STATUS_BY_VALUE[item.adminStatus]

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <InventoryAdminStatusBadge status={item.adminStatus} size="md" />
        <dl className="grid grid-cols-2 gap-2 text-xs">
          {item.registeredAt ? <div><dt className="text-[hsl(var(--muted-foreground))]">Fecha de alta</dt><dd className="font-medium">{formatDay(item.registeredAt)}</dd></div> : null}
          {item.deregisteredAt ? <div><dt className="text-[hsl(var(--muted-foreground))]">Fecha de baja</dt><dd className="font-medium">{formatDay(item.deregisteredAt)}</dd></div> : null}
          {item.deregistrationReason ? <div><dt className="text-[hsl(var(--muted-foreground))]">Motivo</dt><dd className="font-medium">{reasonLabel(item.deregistrationReason)}</dd></div> : null}
        </dl>
        {item.adminStatus === 'deregistered' ? (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Un activo dado de baja es de solo lectura; revierte la baja para editarlo o asignarlo.</p>
        ) : null}
      </div>

      {available.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {available.map((a) => (
            <Button key={a.key} type="button" size="sm" variant={a.destructive ? 'destructive' : a.key.startsWith('reject') || a.key.startsWith('revert') ? 'outline' : 'default'}
              onClick={() => setAction(a.key)}>
              {a.label}
            </Button>
          ))}
        </div>
      ) : status && item.adminStatus === 'deregistration_proposed' ? (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">Pendiente de que alguien con permiso autorice o rechace la baja.</p>
      ) : null}

      <div className="space-y-2">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Historial administrativo</p>
        {isLoading ? <Skeleton className="h-12 w-full" /> : !events?.length ? (
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Sin movimientos administrativos.</p>
        ) : (
          <ol className="space-y-2.5 border-l border-[hsl(var(--border))] pl-3">
            {events.map((e) => (
              <li key={e.id} className="relative text-xs">
                <span className="absolute -left-[17px] top-1 h-2 w-2 rounded-full" style={{ backgroundColor: ADMIN_STATUS_BY_VALUE[e.toStatus]?.color ?? '#94a3b8' }} />
                <p className="font-medium text-[hsl(var(--foreground))]">
                  {ACTION_LABELS[e.action] ?? ADMIN_ACTIONS[e.action]?.label ?? e.action}
                  {e.reason ? <span className="font-normal text-[hsl(var(--muted-foreground))]"> · {reasonLabel(e.reason)}</span> : null}
                </p>
                <p className="text-[hsl(var(--muted-foreground))]">
                  {[e.effectiveDate ? `Efectiva ${formatDay(e.effectiveDate)}` : null, e.actorName, formatStamp(e.createdAt)].filter(Boolean).join(' · ')}
                </p>
                {e.comment ? <p className="mt-0.5 whitespace-pre-line text-[hsl(var(--foreground))]">{e.comment}</p> : null}
                {e.batchId ? <p className="mt-0.5 inline-flex items-center gap-1 text-[hsl(var(--muted-foreground))]"><Layers className="h-3 w-3" />Aplicado por lote{e.batchSize ? ` de ${e.batchSize} activos` : ''}</p> : null}
                {e.act?.hasDocument ? (
                  <button type="button" className="mt-0.5 flex items-center gap-1 font-medium text-[hsl(var(--primary))] underline-offset-2 hover:underline pointer-coarse:min-h-11"
                    disabled={openAct.isPending} onClick={() => openAct.mutate(e.act.id, { onError: (err) => toast.error(err?.message ?? 'No se pudo abrir el acta.') })}>
                    <FileText className="h-3 w-3" />Acta de baja {e.act.folio}
                  </button>
                ) : null}
                {e.fileId ? (
                  <button type="button" className="mt-0.5 flex items-center gap-1 text-[hsl(var(--primary))] underline-offset-2 hover:underline pointer-coarse:min-h-11"
                    onClick={() => setViewerIndex(Math.max(0, evidence.findIndex((f) => f.eventId === e.id)))}>
                    <FileText className="h-3 w-3" />Ver evidencia{e.file?.originalName ? ` · ${e.file.originalName}` : ''}
                  </button>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </div>

      {viewerIndex !== null && evidence.length ? (
        <AdvancedFileViewer open onOpenChange={(open) => { if (!open) setViewerIndex(null) }} files={evidence} activeIndex={Math.min(viewerIndex, evidence.length - 1)}
          onIndexChange={setViewerIndex} onResolveSignedUrl={resolveEvidenceUrl} imageEditing={false} />
      ) : null}

      <InventoryAdminTransitionDialog action={action} itemId={item.id} itemLabel={itemLabel(item)}
        open={Boolean(action)} onOpenChange={(open) => { if (!open) setAction(null) }} />
    </div>
  )
}
