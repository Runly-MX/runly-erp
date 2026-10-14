import { useState } from 'react'
import { Button, Card, SignaturePad } from '@runly/ui'
import { CheckCircle2, Link2, PenLine } from 'lucide-react'
import { toast } from 'sonner'
import { useAuth } from '../../../../auth/AuthProvider'
import { useSavedSignature } from '../../../../hooks/useSavedSignature.js'
import { useCustodyDeliverers, useSignCustody } from '../../hooks/useInventoryCustody.js'
import { useInventoryCan } from '../../hooks/useInventoryAdmin.js'
import { isCustodyEditable } from '../../lib/custody-api.js'
import { DELIVER_ON_BEHALF } from './CustodyDelivererField.jsx'
import { CustodyPublicLinkDialog } from './CustodyPublicLinkDialog.jsx'

function formatDateTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Which saved signature (if any) the current user may apply as deliverer.
function useSavedDelivererOption(custody, enabled) {
  const { userProfile } = useAuth()
  const can = useInventoryCan()
  const canDelegate = can(DELIVER_ON_BEHALF)
  const isMe = Boolean(custody.delivererId) && custody.delivererId === userProfile?.id
  const mine = useSavedSignature({ enabled: enabled && isMe })
  const deliverers = useCustodyDeliverers({ enabled: enabled && !isMe && canDelegate })
  if (!enabled || !custody.delivererId) return null
  if (isMe) return mine.signature?.url ? { label: 'Usar mi firma guardada' } : null
  const other = (deliverers.data ?? []).find((u) => u.id === custody.delivererId)
  if (canDelegate && other?.hasSavedSignature && other.allowDelegation) {
    return { label: `Usar la firma guardada de ${other.name}` }
  }
  return null
}

// Saved signatures stay visible (spec §10.1): the pad shows the stored image
// with "Volver a firmar" while the record is open, read-only once closed.
function SignatureSlot({ custody, role, title, person, signed, signedAt, imageUrl, editable }) {
  const [dataUrl, setDataUrl] = useState(null)
  const [padKey, setPadKey] = useState(0)
  const [drawing, setDrawing] = useState(false)
  const sign = useSignCustody()
  const saved = useSavedDelivererOption(custody, role === 'deliverer' && editable)
  const showPad = signed || drawing || !saved

  async function submit(vars, message) {
    try {
      await sign.mutateAsync({ id: custody.id, role, ...vars })
      toast.success(message)
      setDataUrl(null)
      setDrawing(false)
      setPadKey((k) => k + 1)
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo guardar la firma')
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[hsl(var(--foreground))]">{title}</p>
          <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{person || '—'}</p>
        </div>
        {signed ? (
          <span className="flex shrink-0 items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
            Firmado{signedAt ? ` el ${formatDateTime(signedAt)}` : ''}
          </span>
        ) : null}
      </div>
      {!editable ? (
        signed && imageUrl ? (
          <div className="flex h-40 items-center justify-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] p-2">
            <img src={imageUrl} alt={`Firma de ${person || title}`} className="h-full w-full object-contain dark:invert" />
          </div>
        ) : (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">{signed ? 'Firmado' : 'Sin firma'}</p>
        )
      ) : (
        <>
          {saved ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant={signed ? 'outline' : 'default'} disabled={sign.isPending}
                onClick={() => submit({ useSaved: true }, 'Firma guardada aplicada')}>
                <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />{sign.isPending ? 'Aplicando...' : saved.label}
              </Button>
              {!showPad ? (
                <Button type="button" variant="outline" size="sm" onClick={() => setDrawing(true)} disabled={sign.isPending}>
                  <PenLine className="mr-1.5 h-3.5 w-3.5" />Dibujar firma
                </Button>
              ) : null}
            </div>
          ) : null}
          {showPad ? (
            <>
              <SignaturePad key={`${padKey}-${imageUrl ?? ''}`} onChange={setDataUrl} disabled={sign.isPending} height={160}
                initialImage={signed ? imageUrl : null} />
              {dataUrl || !signed ? (
                <Button type="button" size="sm" variant={saved && !signed ? 'outline' : 'default'}
                  onClick={() => submit({ dataUrl }, signed ? 'Firma reemplazada' : 'Firma guardada')} disabled={!dataUrl || sign.isPending}>
                  {sign.isPending ? 'Guardando...' : signed ? 'Guardar nueva firma' : 'Guardar firma'}
                </Button>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </div>
  )
}

export function CustodySignaturesSection({ custody }) {
  const editable = isCustodyEditable(custody)
  const [linkOpen, setLinkOpen] = useState(false)

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Firmas</h3>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">
            {custody.hasPublicLink && !custody.receiverSigned && editable
              ? 'Hay un enlace de firma activo para el colaborador.'
              : 'Firma aquí o envía un enlace para que el colaborador firme desde su teléfono.'}
          </p>
        </div>
        {editable && !custody.receiverSigned ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
            <Link2 className="mr-1.5 h-3.5 w-3.5" />Enlace de firma
          </Button>
        ) : null}
      </div>
      <div className="grid gap-6 md:grid-cols-2">
        <SignatureSlot custody={custody} role="deliverer" title="Entrega" person={custody.delivererName}
          signed={custody.delivererSigned} signedAt={custody.delivererSignedAt} imageUrl={custody.delivererSignatureUrl} editable={editable} />
        <SignatureSlot custody={custody} role="receiver" title="Recibe" person={custody.employeeName}
          signed={custody.receiverSigned} signedAt={custody.receiverSignedAt} imageUrl={custody.receiverSignatureUrl} editable={editable} />
      </div>
      {editable ? <CustodyPublicLinkDialog open={linkOpen} onOpenChange={setLinkOpen} custody={custody} /> : null}
    </Card>
  )
}
