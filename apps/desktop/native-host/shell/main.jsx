import { useEffect, useState, useSyncExternalStore } from 'react'
import { createRoot } from 'react-dom/client'
import { Button, PageHeader, ErrorState, Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@runly/ui/primitives'
import { Server, ShieldCheck } from 'lucide-react'
import { createInstanceManager } from './manager.js'
import { InstancesPanel } from './InstancesPanel.jsx'
import { DevicePanel } from './DevicePanel.jsx'
import './style.css'
import mark from '../../public/runly/runly-isotipo-dark.png'

const manager = createInstanceManager()

function NativeManager() {
  const state = useSyncExternalStore(manager.subscribe, manager.getSnapshot)
  const [tab, setTab] = useState(location.hash === '#device' ? 'device' : 'instances')
  useEffect(() => { manager.initialize(location.hash) }, [])
  return (
    <main className="manager-shell">
      <header className="flex items-center justify-between gap-4 mb-8">
        <div className="flex items-center gap-3"><img src={mark} width="36" height="36" alt="Runly" /><span className="text-sm font-semibold">Runly</span></div>
        <span className="text-xs text-muted-foreground">Android · {state.info?.nativeHostVersion ?? '…'}</span>
      </header>
      <PageHeader title={tab === 'instances' ? 'Tus instancias' : 'Tu dispositivo'} description={tab === 'instances' ? 'Conecta Runly con tu organización y cambia de instancia cuando lo necesites.' : 'Activa las funciones que quieras usar. Puedes cambiar los permisos desde Android.'} />
      <nav aria-label="Configuración de Runly" className="flex gap-2 mb-6">
        <Button variant={tab === 'instances' ? 'default' : 'outline'} onClick={() => setTab('instances')} disabled={state.busy}><Server size={16} />Instancias</Button>
        <Button variant={tab === 'device' ? 'default' : 'outline'} onClick={() => setTab('device')} disabled={state.busy}><ShieldCheck size={16} />Dispositivo</Button>
      </nav>
      {state.phase === 'loading' || state.phase === 'connecting' ? (
        <div role="status" className="rounded-2xl border border-border p-6 space-y-4"><p>{state.phase === 'loading' ? 'Leyendo la configuración…' : 'Conectando con tu instancia…'}</p><div className="h-2 rounded bg-muted motion-safe:animate-pulse" /></div>
      ) : (
        <>
          {state.error && <div className="mb-6" role="alert"><ErrorState title="No se pudo completar" description={state.error} showReport={false} /></div>}
          {tab === 'instances' ? <InstancesPanel state={state} manager={manager} /> : <DevicePanel />}
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
    </main>
  )
}

createRoot(document.getElementById('root')).render(<NativeManager />)
