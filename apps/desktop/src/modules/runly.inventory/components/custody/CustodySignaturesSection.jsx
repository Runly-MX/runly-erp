import { useState } from 'react'
import { Button, Card, SignaturePad, TextField } from '@runly/ui'
import { CheckCircle2, Copy, Link2 } from 'lucide-react'
import { toast } from 'sonner'
import { useCustodyPublicLink, useSignCustody } from '../../hooks/useInventoryCustody.js'

function formatDateTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function SignatureSlot({ custody, role, title, person, signed, signedAt, editable }) {
  const [dataUrl, setDataUrl] = useState(null)
  const [padKey, setPadKey] = useState(0)
  const sign = useSignCustody()

  async function save() {
    try {
      await sign.mutateAsync({ id: custody.id, role, dataUrl })
      toast.success('Firma guardada')
      setDataUrl(null)
      setPadKey((k) => k + 1)
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo guardar la firma')
    }
  }

  return (
    <div className="space-y-2">
      <div>
        <p className="text-sm font-medium text-[hsl(var(--foreground))]">{title}</p>
        <p className="text-xs text-[hsl(var(--muted-foreground))]">{person || '—'}</p>
      </div>
      {signed ? (
        <p className="flex items-center gap-2 rounded-md bg-[hsl(var(--muted))] px-3 py-2 text-sm">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          Firmado{signedAt ? ` el ${formatDateTime(signedAt)}` : ''}
        </p>
      ) : editable ? (
        <>
          <SignaturePad key={padKey} onChange={setDataUrl} disabled={sign.isPending} height={160} />
          <Button type="button" size="sm" onClick={save} disabled={!dataUrl || sign.isPending}>
            {sign.isPending ? 'Guardando...' : 'Guardar firma'}
          </Button>
        </>
      ) : (
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Sin firma</p>
      )}
    </div>
  )
}

export function CustodySignaturesSection({ custody }) {
  const editable = custody.status === 'DRAFT' || custody.status === 'PENDING_SIGNATURE'
  const publicLink = useCustodyPublicLink()
  const [link, setLink] = useState(null)

  async function sendLink() {
    try {
      const result = await publicLink.mutateAsync(custody.id)
      setLink(result)
      toast.success('Enlace de firma generado')
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo generar el enlace')
    }
  }

  function copy() {
    navigator.clipboard.writeText(link.url)
      .then(() => toast.success('Enlace copiado'))
      .catch(() => toast.error('Selecciona y copia el enlace'))
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold">Firmas</h3>
          <p className="text-xs text-[hsl(var(--muted-foreground))]">Firma aquí o envía un enlace para que el colaborador firme desde su teléfono.</p>
        </div>
        {editable && !custody.receiverSigned ? (
          <Button type="button" variant="outline" size="sm" onClick={sendLink} disabled={publicLink.isPending}>
            <Link2 className="mr-1.5 h-3.5 w-3.5" />{publicLink.isPending ? 'Generando...' : 'Enviar enlace de firma'}
          </Button>
        ) : null}
      </div>
      {link?.url ? (
        <div className="space-y-2 rounded-md border border-[hsl(var(--border))] p-3">
          <div className="flex items-end gap-2">
            <div className="min-w-0 flex-1"><TextField label="Enlace de firma" value={link.url} readOnly /></div>
            <Button type="button" variant="outline" onClick={copy}><Copy className="mr-1.5 h-3.5 w-3.5" />Copiar</Button>
          </div>
          {link.expiresAt ? (
            <p className="text-xs text-[hsl(var(--muted-foreground))]">Vence el {formatDateTime(link.expiresAt)}.</p>
          ) : null}
        </div>
      ) : null}
      <div className="grid gap-6 md:grid-cols-2">
        <SignatureSlot custody={custody} role="deliverer" title="Entrega" person={custody.delivererName}
          signed={custody.delivererSigned} signedAt={custody.delivererSignedAt} editable={editable} />
        <SignatureSlot custody={custody} role="receiver" title="Recibe" person={custody.employeeName}
          signed={custody.receiverSigned} signedAt={custody.receiverSignedAt} editable={editable} />
      </div>
    </Card>
  )
}
