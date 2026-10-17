import { useState } from 'react'
import { Alert, AlertDescription, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, Input } from '@runly/ui'
import { Check, Copy, KeyRound } from 'lucide-react'
import { toast } from 'sonner'
import { absoluteShareUrl } from '../../lib/lmsShare.js'

const MUTED = 'text-xs text-[hsl(var(--muted-foreground))]'

function useCopy() {
  const [copied, setCopied] = useState(null)
  async function copy(id, text) {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(id)
      setTimeout(() => setCopied((current) => (current === id ? null : current)), 1500)
    } catch { toast.error('No se pudo copiar. Selecciona el texto y cópialo a mano.') }
  }
  return { copied, copy }
}

const linkOf = (item) => absoluteShareUrl({ url: item.link })
const messageFor = (item) => `Curso: ${linkOf(item)}\nCódigo de acceso: ${item.code}`

// Invites whose email was not sent (no SMTP or a failed send): the plain link and
// code, shown only now, to copy and send by hand. items: [{ invite, link, code, mailError }].
export function InviteCodesDialog({ open, onOpenChange, items = [] }) {
  const { copied, copy } = useCopy()
  const reason = items.find((item) => item.mailError)?.mailError?.message
  const all = items.map((item) => `${item.invite.name ? `${item.invite.name} <${item.invite.email}>` : item.invite.email}\n${messageFor(item)}`).join('\n\n')
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent scrollable size="lg" className="gap-0 p-0 md:p-0 md:pt-0!">
        <DialogHeader icon={KeyRound} className="mb-0 shrink-0 px-5 pt-4 pb-3">
          <DialogTitle>Envía el acceso a mano</DialogTitle>
          <DialogDescription>Copia el enlace personal y el código de cada persona. El código solo se muestra ahora; si lo pierdes, usa «Reenviar» para generar otro.</DialogDescription>
        </DialogHeader>
        <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {reason ? <Alert><AlertDescription>{reason}</AlertDescription></Alert> : null}
          <ul className="space-y-3">
            {items.map((item) => (
              <li key={item.invite.id} className="space-y-2 rounded-md border border-[hsl(var(--border))] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.invite.name || item.invite.email}</p>
                    {item.invite.name ? <p className={`${MUTED} truncate`}>{item.invite.email}</p> : null}
                  </div>
                  <Button variant="outline" size="sm" onClick={() => copy(`${item.invite.id}:all`, messageFor(item))}>
                    {copied === `${item.invite.id}:all` ? <Check /> : <Copy />}Copiar mensaje
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input readOnly value={linkOf(item)} onFocus={(event) => event.target.select()} aria-label={`Enlace de ${item.invite.email}`} className="font-mono text-xs" />
                  <Button variant="outline" size="icon" aria-label="Copiar enlace" onClick={() => copy(`${item.invite.id}:link`, linkOf(item))}>
                    {copied === `${item.invite.id}:link` ? <Check /> : <Copy />}
                  </Button>
                </div>
                <div className="flex items-center gap-2">
                  <span className={MUTED}>Código</span>
                  <span className="rounded-md bg-[hsl(var(--muted))] px-2 py-1 font-mono text-sm font-semibold tracking-widest">{item.code}</span>
                  <Button variant="ghost" size="icon-sm" aria-label="Copiar código" onClick={() => copy(`${item.invite.id}:code`, item.code)}>
                    {copied === `${item.invite.id}:code` ? <Check /> : <Copy />}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <DialogFooter className="mt-0 shrink-0 px-5 py-3">
          {items.length > 1 ? (
            <Button variant="outline" className="sm:mr-auto" onClick={() => copy('all', all)}>{copied === 'all' ? <Check /> : <Copy />}Copiar todo</Button>
          ) : null}
          <Button onClick={() => onOpenChange(false)}>Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
