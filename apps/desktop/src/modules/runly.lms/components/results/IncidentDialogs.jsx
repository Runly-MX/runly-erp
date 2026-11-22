import { useState } from 'react'
import { Alert, AlertDescription, Button, Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, NumberField, TextareaField } from '@runly/ui'
import { Ban, Clock, Loader2, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { useExtendSession, useExtraSession, useVoidSession } from '../../hooks/useLmsResults.js'

const COPY = {
  extend: {
    icon: Clock, title: 'Extender el tiempo', confirm: 'Extender', tone: 'default',
    description: 'Solo mientras la sesión sigue en curso y antes de que venza. El cronómetro del participante se actualiza en su siguiente consulta.',
  },
  void: {
    icon: Ban, title: 'Anular la sesión', confirm: 'Anular', tone: 'destructive',
    description: 'Las respuestas y archivos se conservan, pero la sesión deja de calificarse y sigue contando como intento usado. Para que repita, autoriza después un intento adicional.',
  },
  extra: {
    icon: RotateCcw, title: 'Autorizar un intento adicional', confirm: 'Autorizar', tone: 'default',
    description: 'La persona podrá iniciar una sesión nueva con la configuración vigente. Esta sesión se conserva en el historial.',
  },
}

// One dialog for the three incidents; every one asks for the reason, which
// stays in the history with who did it and when.
export function IncidentDialog({ kind, record, onOpenChange, onConflict }) {
  const { session, enrollment } = record
  const extend = useExtendSession(session.id), voidIt = useVoidSession(session.id), extra = useExtraSession(session.id)
  const [minutes, setMinutes] = useState('10')
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)
  const copy = COPY[kind] ?? COPY.extend
  const pending = extend.isPending || voidIt.isPending || extra.isPending

  async function confirm() {
    if (reason.trim().length < 5) return setError('Escribe el motivo (al menos 5 caracteres).')
    setError(null)
    try {
      if (kind === 'extend') await extend.mutateAsync({ minutes: Number(minutes), reason, expectedUpdatedAt: session.updatedAt })
      if (kind === 'void') await voidIt.mutateAsync({ reason })
      if (kind === 'extra') await extra.mutateAsync({ enrollmentId: enrollment.id, reason, expectedExtraSessions: enrollment.extraSessions, sessionId: session.id })
      setReason('')
      onOpenChange(false)
    } catch (err) {
      toast.error(err.message || 'No se pudo completar la acción.')
      if (err?.details?.code === 'CONFLICT' || err?.details?.code === 'EXPIRED' || err?.details?.code === 'SESSION_CLOSED') onConflict()
    }
  }

  const Icon = copy.icon
  return (
    <Dialog open={Boolean(kind)} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader icon={Icon}>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          {kind === 'extend' ? (
            <>
              <NumberField label="Minutos adicionales" required value={minutes} onChange={(event) => setMinutes(event.target.value)} min={1} max={240} allowNegative={false} allowDecimal={false} hint="De 1 a 240." />
              {session.expiresAt ? <Alert><AlertDescription>Vence {new Date(session.expiresAt).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' })}{session.extendedMinutes ? ` (ya se extendió ${session.extendedMinutes} min)` : ''}.</AlertDescription></Alert> : null}
            </>
          ) : null}
          {kind === 'extra' ? <p className="text-sm">Intentos adicionales autorizados hasta ahora: <span className="font-medium tabular-nums">{enrollment.extraSessions}</span></p> : null}
          <TextareaField label="Motivo" required rows={3} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} error={error ?? undefined} hint="Queda en el historial de la sesión." />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button type="button" variant={copy.tone === 'destructive' ? 'destructive' : 'default'} onClick={confirm} disabled={pending}>
            {pending ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}{copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
