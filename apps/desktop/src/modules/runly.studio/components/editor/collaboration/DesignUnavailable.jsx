import { Button } from '@runly/ui'
import { ArrowLeft, Compass, RefreshCw } from 'lucide-react'
import { LostAccent, LostInSpace } from './LostInSpace.jsx'

// A design that cannot be opened: it does not exist (404) or this person has no
// access (403). Other failures keep the generic error state with retry/report.
export function isDesignUnavailable(error) {
  return error?.status === 404 || error?.status === 403
}

export function DesignUnavailable({ error, onBack, onRetry }) {
  const denied = error?.status === 403
  return (
    <LostInSpace
      badge={<><Compass className="h-3.5 w-3.5" aria-hidden />Studio</>}
      title={denied ? <>No tienes <LostAccent>acceso</LostAccent> a este diseño</> : <>No encontramos este <LostAccent>diseño</LostAccent></>}
      description={denied
        ? 'Quien lo creó no lo ha compartido contigo, o tus permisos cambiaron. Pídele que te vuelva a invitar.'
        : 'Puede que lo hayan eliminado o que el enlace ya no sea válido. Vuelve a tus diseños para seguir creando.'}
    >
      <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
        <Button onClick={onBack} className="gap-1.5"><ArrowLeft className="h-4 w-4" aria-hidden />Volver a mis diseños</Button>
        {onRetry ? <Button variant="outline" onClick={onRetry} className="gap-1.5 border-white/80 bg-white/45 backdrop-blur-md dark:border-[hsl(var(--input))] dark:bg-transparent"><RefreshCw className="h-4 w-4" aria-hidden />Reintentar</Button> : null}
      </div>
    </LostInSpace>
  )
}
