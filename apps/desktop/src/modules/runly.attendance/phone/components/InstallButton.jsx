import { useEffect, useState } from 'react'
import { Download, Share, SquarePlus } from 'lucide-react'
import { Button, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@runly/ui'
import { isIosSafari, isStandalone } from '../lib/install.js'

// "Instalar Checador": native prompt on Chrome/Android, short steps sheet on iOS Safari,
// hidden when already running as the installed app.
export function InstallButton({ className = '' }) {
  const [installEvent, setInstallEvent] = useState(null)
  const [installed, setInstalled] = useState(() => isStandalone())
  const [showSteps, setShowSteps] = useState(false)
  const ios = isIosSafari()

  useEffect(() => {
    const onPrompt = (e) => { e.preventDefault(); setInstallEvent(e) }
    const onInstalled = () => { setInstalled(true); setInstallEvent(null) }
    window.addEventListener('beforeinstallprompt', onPrompt)
    window.addEventListener('appinstalled', onInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  if (installed || (!installEvent && !ios)) return null

  const install = async () => {
    if (!installEvent) return setShowSteps(true)
    await installEvent.prompt()
    setInstallEvent(null)
  }

  return (
    <>
      <Button variant="outline" className={`border-white/20 bg-transparent text-white hover:bg-white/10 ${className}`} onClick={install}>
        <Download /> Instalar Checador
      </Button>
      <Dialog open={showSteps} onOpenChange={setShowSteps}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Instalar Checador</DialogTitle>
            <DialogDescription>Para abrirlo como una app desde tu pantalla de inicio.</DialogDescription>
          </DialogHeader>
          <ol className="space-y-3 text-sm">
            <li className="flex items-start gap-3"><Share className="mt-0.5 size-5 shrink-0 text-teal-600" /><span>Toca <strong>Compartir</strong> en la barra de Safari.</span></li>
            <li className="flex items-start gap-3"><SquarePlus className="mt-0.5 size-5 shrink-0 text-teal-600" /><span>Elige <strong>Añadir a pantalla de inicio</strong>.</span></li>
            <li className="flex items-start gap-3"><Download className="mt-0.5 size-5 shrink-0 text-teal-600" /><span>Abre <strong>Checador</strong> desde tu pantalla de inicio y activa tu teléfono ahí con tu código.</span></li>
          </ol>
          <Button onClick={() => setShowSteps(false)}>Entendido</Button>
        </DialogContent>
      </Dialog>
    </>
  )
}
