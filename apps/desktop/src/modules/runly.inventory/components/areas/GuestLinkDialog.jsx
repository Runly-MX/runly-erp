import { Alert, AlertDescription, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input, Label, copyText } from '@runly/ui'
import { Copy, KeyRound, Link2 } from 'lucide-react'
import { toast } from 'sonner'

function CopyRow({ label, value, mono }) {
  async function copy() {
    if (await copyText(value)) toast.success('Copiado')
    else toast.error('No se pudo copiar')
  }
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input readOnly value={value} className={mono ? 'font-mono' : ''} onFocus={(e) => e.target.select()} />
        <Button type="button" variant="outline" size="icon" aria-label={`Copiar ${label.toLowerCase()}`} onClick={copy}><Copy className="h-4 w-4" /></Button>
      </div>
    </div>
  )
}

// Shows the link (and the one-time code) after inviting or resending, plus the
// mail error when the email could not be delivered so the manager can share it by hand.
// Changing only the code returns no link: the supplier keeps using the one they already have.
export function GuestLinkDialog({ result, onClose }) {
  const codeOnly = Boolean(result) && !result.link
  return (
    <Dialog open={Boolean(result)} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent scrollable size="md">
        <DialogHeader icon={codeOnly ? KeyRound : Link2}>
          <DialogTitle>{codeOnly ? 'Código de acceso' : 'Enlace de acceso'}</DialogTitle>
          <DialogDescription>{result?.guest?.email}</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-0.5">
          {codeOnly ? (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">
              {result?.code
                ? 'El enlace del proveedor sigue siendo el mismo. Sus sesiones abiertas terminaron: al volver a entrar tendrá que escribir este código.'
                : 'El enlace ya no pide código. Sus sesiones abiertas terminaron y puede volver a entrar directamente.'}
            </p>
          ) : result?.mailError ? (
            <Alert variant="destructive">
              <AlertDescription>No se pudo enviar el correo{result.mailError.message ? `: ${result.mailError.message}` : ''}. Comparte el enlace manualmente.</AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm text-[hsl(var(--muted-foreground))]">Enviamos el enlace por correo. También puedes compartirlo tú.</p>
          )}
          {result?.link ? <CopyRow label="Enlace" value={result.link} /> : null}
          {result?.code ? (
            <>
              <CopyRow label="Código de acceso" value={result.code} mono />
              <p className="text-xs text-[hsl(var(--muted-foreground))]">Este código solo se muestra ahora. Compártelo por un medio distinto al correo.</p>
            </>
          ) : null}
        </div>
        <DialogFooter className="shrink-0"><Button type="button" onClick={onClose}>Listo</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
