import { createRoot } from 'react-dom/client'
import { useEffect } from 'react'
import { Button, ErrorState, PageHeader } from '@runly/ui'
import { native } from '../native/index.js'
import { RUNLY_DESKTOP_DOWNLOAD_URL } from '../lib/appConfig.js'
import '../styles.css'

function BootFailure({ error }) {
  const bridgeBlocked = String(error?.message ?? error).includes('not allowed')
  useEffect(() => { native.ready().catch(() => {}) }, [])
  return (
    <main className="min-h-dvh bg-background text-foreground flex items-center justify-center p-6">
      <div className="w-full max-w-xl space-y-6">
        <PageHeader title="La aplicación no pudo iniciar" description="La página se abrió, pero Runly no terminó de preparar la conexión." />
        <ErrorState title={bridgeBlocked ? 'Actualiza la aplicación de Runly' : 'Revisa la conexión de la instancia'} description={bridgeBlocked ? 'Esta versión del cliente bloqueó la comunicación con la web. Descarga la actualización y vuelve a conectar.' : 'Verifica la conexión y que la instancia tenga la web actualizada. Puedes reintentar desde aquí.'} showReport={false} />
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => window.location.reload()}>Reintentar</Button>
          {bridgeBlocked && native.isDesktop() && <Button asChild variant="outline"><a href={RUNLY_DESKTOP_DOWNLOAD_URL}>Actualizar Runly para Windows</a></Button>}
          {native.isDesktop() && <p className="w-full text-sm text-muted-foreground">Para elegir otra instancia, abre el menú Runly de esta ventana.</p>}
        </div>
      </div>
    </main>
  )
}

export function renderBootFailure(error) {
  createRoot(document.getElementById('root')).render(<BootFailure error={error} />)
}
