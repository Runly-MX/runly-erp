import { Button } from '@runly/ui'
import { ArrowLeft, ShieldOff } from 'lucide-react'

// Shown when the server stops authorising this person (access revoked or the
// design deleted). Unsent changes stay in this browser; nothing else is implied.
export function AccessLost({ onBack, preserved, onDownload, copyFailed }) {
  return (
    <div role="alert" className="flex h-full items-center justify-center p-6">
      <div className="flex max-w-sm flex-col items-center gap-4 text-center">
        <span className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--muted))]"><ShieldOff className="h-7 w-7 text-[hsl(var(--muted-foreground))]" aria-hidden /></span>
        <div className="space-y-1.5">
          <h2 className="text-base font-semibold">Ya no tienes acceso a este diseño</h2>
          <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">
            El diseño dejó de estar disponible o tus permisos cambiaron. {copyFailed ? 'No se pudo guardar la copia en este navegador. Descarga el borrador antes de salir.' : preserved ? 'Los cambios que no llegaron al servidor se conservan en este navegador.' : 'No quedaron cambios sin enviar.'}
          </p>
        </div>
        {onDownload ? <><Button variant="outline" onClick={onDownload}>Descargar borrador local</Button><p className="text-xs text-[hsl(var(--muted-foreground))]">Guarda el documento en JSON, sin originales de imágenes. No recupera el acceso al diseño.</p></> : null}
        <Button onClick={onBack} className="gap-1.5"><ArrowLeft className="h-4 w-4" aria-hidden />Volver a mis diseños</Button>
      </div>
    </div>
  )
}
