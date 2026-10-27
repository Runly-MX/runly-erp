import { Button } from '@runly/ui'
import { ArrowLeft, Download, ShieldOff } from 'lucide-react'
import { LostAccent, LostInSpace } from './LostInSpace.jsx'

// Shown when the server stops authorising this person (access revoked or the
// design deleted). Unsent changes stay in this browser; nothing else is implied.
export function AccessLost({ onBack, preserved, onDownload, copyFailed }) {
  return (
    <LostInSpace
      badge={<><ShieldOff className="h-3.5 w-3.5" aria-hidden />Studio</>}
      title={<>Ya no tienes <LostAccent>acceso</LostAccent> a este diseño</>}
      description={<>Parece que este diseño salió de órbita: dejó de estar disponible o tus permisos cambiaron. {copyFailed ? 'No se pudo guardar la copia en este navegador. Descarga el borrador antes de salir.' : preserved ? 'Los cambios que no llegaron al servidor se conservan en este navegador.' : 'No quedaron cambios sin enviar.'}</>}
    >
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={onBack} className="gap-1.5"><ArrowLeft className="h-4 w-4" aria-hidden />Volver a mis diseños</Button>
        {onDownload ? <Button variant="outline" onClick={onDownload} className="gap-1.5 border-white/80 bg-white/45 backdrop-blur-md dark:border-[hsl(var(--input))] dark:bg-transparent"><Download className="h-4 w-4" aria-hidden />Descargar borrador local</Button> : null}
      </div>
      {onDownload ? <p className="mt-3 max-w-sm text-xs text-[hsl(var(--muted-foreground))]">Guarda el documento en JSON, sin originales de imágenes. No recupera el acceso al diseño.</p> : null}
    </LostInSpace>
  )
}
