import { useEffect, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, PageHeader, ErrorState, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@runly/ui/primitives'
import { Server, ShieldCheck, ArrowRight, Monitor } from 'lucide-react'
import { createInstanceManager } from './manager.js'
import { InstancesPanel } from './InstancesPanel.jsx'
import { DevicePanel } from './DevicePanel.jsx'
import { WindowsDevicePanel } from './WindowsDevicePanel.jsx'
import './style.css'
import mark from '../../public/runly/runly-isotipo-dark.png'

const manager = createInstanceManager()
document.documentElement.dataset.platform = window.__RUNLY_NATIVE_HOST__?.platform ?? 'android'

function NativeManager() {
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot)
  const [tab, setTab] = useState(location.hash === '#device' ? 'device' : 'instances')
  const windows = window.__RUNLY_NATIVE_HOST__?.platform === 'windows'
  useEffect(() => { manager.initialize(location.hash) }, [])
  useEffect(() => {
    const change = () => { setTab(location.hash === '#device' ? 'device' : 'instances'); manager.initialize(location.hash) }
    window.addEventListener('hashchange', change)
    return () => window.removeEventListener('hashchange', change)
  }, [])
  return (
    <main className="manager-shell">
      <aside className="manager-intro">
        <img src={mark} width="52" height="52" alt="Runly" />
        <p className="intro-eyebrow">TU ESPACIO DE TRABAJO</p>
        <h1>Todo tu equipo.<br />Un solo lugar.</h1>
        <p className="intro-description">Tus organizaciones, tus herramientas y tus conversaciones. Conecta tu instancia y sigue trabajando.</p>
        <div className="intro-steps"><p><Server size={20} />Guarda las instancias de tus organizaciones.</p><p><ArrowRight size={20} />Cambia de espacio cuando lo necesites.</p><p><ShieldCheck size={20} />Activa únicamente las funciones que uses.</p></div>
        <p className="intro-footer"><Monitor size={16} />Runly para Windows</p>
      </aside>
      <div className="manager-content">
      <header className="flex items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3"><img src={mark} width="36" height="36" alt="Runly" /><span className="text-sm font-semibold">Runly</span></div>
        <span className="text-xs text-muted-foreground">{windows ? 'Windows' : state.info?.platform === 'ios' ? 'iOS' : 'Android'} · {state.info?.nativeHostVersion ?? '…'}</span>
      </header>
      <PageHeader title={tab === 'instances' ? 'Tus instancias' : 'Tu dispositivo'} description={tab === 'instances' ? 'Elige tu espacio de trabajo o agrega una organización.' : 'Revisa las funciones y los permisos de tu equipo.'} />
      <nav aria-label="Configuración de Runly" className="flex gap-2 mb-6">
        <Button variant={tab === 'instances' ? 'default' : 'outline'} onClick={() => setTab('instances')} disabled={state.busy}><Server size={16} />Instancias</Button>
        <Button variant={tab === 'device' ? 'default' : 'outline'} onClick={() => setTab('device')} disabled={state.busy}><ShieldCheck size={16} />Dispositivo</Button>
      </nav>
      {state.phase === 'loading' || state.phase === 'connecting' ? (
        <div role="status" className="rounded-2xl border border-border p-6 space-y-4"><p>{state.phase === 'loading' ? 'Leyendo la configuración…' : 'Conectando con tu instancia…'}</p><div className="h-2 rounded bg-muted motion-safe:animate-pulse" /></div>
      ) : (
        <>
          {state.error && <div className="mb-6" role="alert"><ErrorState title="No se pudo completar" description={state.error} showReport={false} /></div>}
          {tab === 'instances' ? <InstancesPanel state={state} manager={manager} /> : windows ? <WindowsDevicePanel /> : <DevicePanel />}
        </>
      )}
      <Dialog open={state.phase === 'confirm'} onOpenChange={(open) => { if (!open && !state.busy) manager.cancel() }}>
        <DialogContent size="sm">
          <DialogHeader><DialogTitle>Confiar en esta instancia</DialogTitle><DialogDescription>Verifica que este dominio pertenece a tu organización. La instancia podrá usar las funciones del dispositivo que tú autorices.</DialogDescription></DialogHeader>
          <p className="rounded-xl bg-muted p-4 break-all font-medium">{state.pending}</p>
          <div className="flex flex-wrap gap-3 justify-end"><Button variant="outline" onClick={() => manager.cancel()} disabled={state.busy}>Cancelar</Button><Button onClick={() => manager.confirm()} disabled={state.busy}>Confiar y conectar</Button></div>
        </DialogContent>
      </Dialog>
      <details className="mt-8 text-xs text-muted-foreground"><summary className="cursor-pointer py-3">Diagnóstico</summary><p className="break-all">Host {state.info?.nativeHostVersion ?? '…'} · {state.info?.osVersion ?? ''}</p><p className="break-all">{state.registry.activeOrigin ?? 'Sin instancia activa'}</p>{state.diagnostic && <p className="break-all">{state.diagnostic}</p>}</details>
      </div>
    </main>
  )
}

createRoot(document.getElementById('root')).render(<NativeManager />)
