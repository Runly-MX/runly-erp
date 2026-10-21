import { AlertTriangle, KeyRound, Send } from 'lucide-react'
import { Button } from '@runly/ui'

const NOUN = { serialNumber: 'número de serie', assetTag: 'número de activo' }

// Warning under the serial / asset number when the duplicate lives in a folder the user cannot open: it
// explains why and offers the two ways forward (values to review, or an access request).
export function RestrictedDuplicateNote({ field, onPropose }) {
  return (
    <div role="alert" className="mt-1.5 space-y-2 text-xs text-[hsl(var(--warning,var(--destructive)))]">
      <p className="flex items-start gap-1.5">
        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>Ya existe un item activo con este {NOUN[field] ?? 'número'} en una carpeta a la que no tienes acceso.</span>
      </p>
      {onPropose ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" className="[@media(pointer:coarse)]:min-h-11" onClick={() => onPropose('change')}>
            <Send className="mr-1.5 h-3.5 w-3.5" />Enviar mis datos a revisión
          </Button>
          <Button type="button" size="sm" variant="outline" className="[@media(pointer:coarse)]:min-h-11" onClick={() => onPropose('access_request')}>
            <KeyRound className="mr-1.5 h-3.5 w-3.5" />Solicitar acceso
          </Button>
        </div>
      ) : null}
    </div>
  )
}
