import { useEffect, useState } from 'react'
import {
  Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, TextField,
} from '@runly/ui'
import { Copy, Link2, Mail, Smartphone } from 'lucide-react'
import { toast } from 'sonner'
import { useCustodyPublicLink } from '../../hooks/useInventoryCustody.js'

function formatDateTime(value) {
  if (!value) return ''
  return new Date(value).toLocaleString('es-MX', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

// Generates the public signing link and optionally e-mails it to the employee.
// Each request issues a fresh link; the previous one stops working.
export function CustodyPublicLinkDialog({ open, onOpenChange, custody }) {
  const publicLink = useCustodyPublicLink()
  const [link, setLink] = useState(null)
  const email = custody.employeeEmail

  useEffect(() => { if (!open) setLink(null) }, [open])

  async function generate(sendEmail) {
    try {
      const result = await publicLink.mutateAsync({ id: custody.id, sendEmail })
      setLink(result)
      if (!sendEmail) toast.success('Enlace de firma generado')
      else if (result.emailSent) toast.success('Enlace enviado', { description: `Se envió a ${email}.` })
      else toast.warning('Enlace generado, pero no se pudo enviar el correo', { description: 'Copia el enlace y compártelo por otro medio.' })
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <div className="flex items-start gap-4">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[hsl(var(--primary))]/12 text-[hsl(var(--primary))]" aria-hidden="true"><Smartphone className="h-5 w-5" /></span>
            <div className="min-w-0 flex-1 space-y-1.5">
              <DialogTitle>Enlace de firma</DialogTitle>
              <DialogDescription>
                {custody.employeeName} podrá revisar el resguardo y firmar desde su teléfono, sin iniciar sesión.
                {custody.hasPublicLink ? ' Generar uno nuevo invalida el enlace anterior.' : ''}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>
        <div className="space-y-3">
          {link?.url ? (
            <div className="space-y-2">
              <div className="flex items-end gap-2">
                <div className="min-w-0 flex-1"><TextField label="Enlace" value={link.url} readOnly /></div>
                <Button type="button" variant="outline" onClick={copy}><Copy className="mr-1.5 h-3.5 w-3.5" />Copiar</Button>
              </div>
              {link.expiresAt ? <p className="text-xs text-[hsl(var(--muted-foreground))]">Vence el {formatDateTime(link.expiresAt)}.</p> : null}
            </div>
          ) : (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Genera el enlace para copiarlo, o envíalo directamente al correo del colaborador.</p>
          )}
          {!email ? (
            <p className="rounded-md bg-[hsl(var(--muted))] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]">
              El colaborador no tiene correo registrado en Recursos Humanos; no es posible enviarlo por correo.
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => generate(true)} disabled={!email || publicLink.isPending}
            title={email ? `Enviar a ${email}` : 'El colaborador no tiene correo registrado'}>
            <Mail className="mr-1.5 h-3.5 w-3.5" />Enviar por correo al colaborador
          </Button>
          <Button type="button" onClick={() => generate(false)} disabled={publicLink.isPending}>
            <Link2 className="mr-1.5 h-3.5 w-3.5" />{publicLink.isPending ? 'Generando...' : link?.url ? 'Generar otro' : 'Generar enlace'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
