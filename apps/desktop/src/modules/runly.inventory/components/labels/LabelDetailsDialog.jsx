import { useState } from 'react'
import {
  Button, ConfirmDialog, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, EmptyState, Skeleton, TextField,
} from '@runly/ui'
import { Copy, History, QrCode, Unlink } from 'lucide-react'
import { toast } from 'sonner'
import { useItemPublicLink, useLabelPreview, useRevokePublicLink } from '../../hooks/useInventoryLabels.js'

// Render body for a square image with only the QR (default template's QR options).
export const qrOnlyBody = (itemId, dpi) => ({
  items: [{ itemId, quantity: 1 }],
  layout: { widthMm: 30, heightMm: 30, layout: 'qr-top', fields: [], dpi },
  format: 'png',
})

const formatDateTime = (value) => new Date(value).toLocaleString('es-MX', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// "Ver con detalles": large QR, its link and the print history of one item.
export function LabelDetailsDialog({ open, onOpenChange, item, history, canPrint, canManage = false }) {
  const preview = useLabelPreview(open && item?.id ? qrOnlyBody(item.id, 600) : null, { enabled: canPrint, delay: 0 })
  const linkQuery = useItemPublicLink(item?.id, { enabled: open && canPrint })
  const link = linkQuery.data?.url ?? ''
  const revoke = useRevokePublicLink(item?.id)
  const [confirmRevoke, setConfirmRevoke] = useState(false)
  const rows = history.data ?? []

  function copy() {
    navigator.clipboard.writeText(link)
      .then(() => toast.success('Enlace copiado'))
      .catch(() => toast.error('Selecciona y copia el enlace'))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="lg">
        <DialogHeader icon={QrCode}>
          <DialogTitle>Etiqueta / QR</DialogTitle>
          <DialogDescription>{[item?.folio, item?.name].filter(Boolean).join(' · ')}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain px-0.5">
          <div className="flex justify-center">
            <div className="flex aspect-square w-full max-w-[280px] items-center justify-center rounded-md border border-[hsl(var(--border))] bg-white p-3">
              {preview.url ? (
                <img src={preview.url} alt="Código QR del equipo" className="h-full w-full object-contain" />
              ) : canPrint && !preview.error ? (
                <Skeleton className="h-full w-full" />
              ) : (
                <p className="px-4 text-center text-xs text-neutral-500">
                  {preview.error ?? 'Necesitas el permiso Imprimir etiquetas de inventario para ver el código.'}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1">
              <TextField label="Enlace del código" value={link} readOnly
                placeholder={linkQuery.isLoading ? 'Generando enlace…' : (canPrint ? '' : 'Necesitas el permiso Imprimir etiquetas')} />
            </div>
            <Button type="button" variant="outline" onClick={copy} disabled={!link}><Copy className="mr-1.5 h-3.5 w-3.5" />Copiar</Button>
          </div>
          {canManage ? (
            <div className="flex items-start justify-between gap-3 rounded-md border border-[hsl(var(--border))] px-3 py-2">
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Si el código se filtró o la etiqueta se perdió, revoca el enlace: las etiquetas impresas dejan de funcionar y se genera un enlace nuevo.</p>
              <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setConfirmRevoke(true)} disabled={!link}>
                <Unlink className="mr-1.5 h-3.5 w-3.5" />Revocar enlace
              </Button>
            </div>
          ) : null}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))]">Historial de impresión</h3>
            {history.isLoading ? (
              <div className="space-y-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
            ) : rows.length === 0 ? (
              <EmptyState variant="compact" icon={History} title="Sin impresiones" description="Este equipo aún no tiene etiqueta impresa." />
            ) : (
              <ul className="divide-y divide-[hsl(var(--border)/0.6)] rounded-md border border-[hsl(var(--border))]">
                {rows.map((row) => (
                  <li key={row.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{formatDateTime(row.printedAt)}</p>
                      <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">
                        {[row.userName, row.templateName, row.printerName ?? 'Descarga o navegador'].filter(Boolean).join(' · ')}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-[hsl(var(--muted-foreground))]">× {row.quantity}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <DialogFooter className="shrink-0">
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog
        open={confirmRevoke}
        onOpenChange={setConfirmRevoke}
        title="Revocar enlace público"
        description="El enlace y el código QR actuales dejarán de funcionar. Las etiquetas ya impresas de este equipo deberán reimprimirse."
        detail={[item?.folio, item?.name].filter(Boolean).join(' · ')}
        confirmLabel="Revocar enlace"
        loading={revoke.isPending}
        onConfirm={async () => {
          try {
            await revoke.mutateAsync()
            toast.success('Enlace revocado. Se generó uno nuevo.')
          } catch (err) {
            toast.error(err?.message ?? 'No se pudo revocar el enlace')
          }
          setConfirmRevoke(false)
        }}
      />
    </Dialog>
  )
}
