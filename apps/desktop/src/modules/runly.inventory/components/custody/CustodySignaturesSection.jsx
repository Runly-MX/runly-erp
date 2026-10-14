import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Card, SignaturePad } from '@runly/ui'
import { CheckCircle2, Link2, PenLine, RefreshCw } from 'lucide-react'
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

// A captured signature never renders as a blank pad (spec §11.1): when its
// image is unavailable it shows "Firma capturada" with a reload action.
function SignatureImage({ imageUrl, alt }) {
  const qc = useQueryClient()
  const [failed, setFailed] = useState(false)
  return (
    <div className="mx-auto flex aspect-[5/2] w-full max-w-[600px] items-center justify-center rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted)/0.4)] p-2">
      {imageUrl && !failed ? (
        <img src={imageUrl} alt={alt} className="h-full w-full object-contain dark:invert" onError={() => setFailed(true)} />
      ) : (
        <div className="flex flex-col items-center gap-1 text-center text-sm text-[hsl(var(--muted-foreground))]">
          <CheckCircle2 className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
          <span>Firma capturada</span>
          <Button type="button" variant="ghost" size="sm"
            onClick={() => { setFailed(false); qc.invalidateQueries({ queryKey: ['inventory', 'custodies', 'detail'] }) }}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Volver a cargar la imagen
          </Button>
        </div>
      )}
    </div>
  )
}

function signedToast(custody, message) {
  if (custody?.status === 'COMPLETED') {
    toast.success('Resguardo completado', { description: 'Ambas firmas quedaron capturadas; se generó el documento y se actualizaron las asignaciones.' })
  } else if (custody?.completionError) {
    toast.warning('Firma guardada, pero el resguardo no se pudo completar', { description: custody.completionError })
  } else {
    toast.success(message)
  }
}

// Saved signatures stay visible (spec §10.1). The receiver's is locked once
// captured (spec §11.3); the deliverer's can be redrawn until completion.
function SignatureSlot({ custody, role, title, person, signed, signedAt, imageUrl, editable }) {
  const [dataUrl, setDataUrl] = useState(null)
  const [padKey, setPadKey] = useState(0)
  const [drawing, setDrawing] = useState(false)
  const sign = useSignCustody()
  const locked = role === 'receiver' && signed
  const saved = useSavedDelivererOption(custody, role === 'deliverer' && editable)
  const showPad = signed || drawing || !saved
  // Signed URLs change on every refetch; keep the pad keyed by the file, not the URL.
  const signedKey = signed ? (signedAt ?? 'signed') : 'empty'

  async function submit(vars, message) {
    try {
      const next = await sign.mutateAsync({ id: custody.id, role, ...vars })
      signedToast(next, message)
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
      {!editable || locked || (signed && !imageUrl) ? (
        signed ? (
          <SignatureImage imageUrl={imageUrl} alt={`Firma de ${person || title}`} />
        ) : (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">Sin firma</p>
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
              <SignaturePad key={`${padKey}-${signedKey}`} onChange={setDataUrl} disabled={sign.isPending}
                initialImage={signed ? imageUrl : null} />
              {dataUrl || !signed ? (
                <div className="mx-auto w-full max-w-[600px]">
                  <Button type="button" size="sm" variant={saved && !signed ? 'outline' : 'default'}
                    onClick={() => submit({ dataUrl }, signed ? 'Firma reemplazada' : 'Firma guardada')} disabled={!dataUrl || sign.isPending}>
                    {sign.isPending ? 'Guardando...' : signed ? 'Guardar nueva firma' : 'Guardar firma'}
                  </Button>
                </div>
              ) : null}
              {role === 'receiver' && !signed ? (
                <p className="mx-auto w-full max-w-[600px] text-xs text-[hsl(var(--muted-foreground))]">
                  Una vez guardada, la firma de quien recibe no puede reemplazarse.
                </p>
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
