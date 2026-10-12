import { useState } from 'react'
import { Button, TextField, EmptyState, ConfirmDialog } from '@runly/ui/primitives'
import { Server, Plus, Trash2, ArrowRight } from 'lucide-react'

export function InstancesPanel({ state, manager }) {
  const [name, setName] = useState('')
  const [origin, setOrigin] = useState('')
  const [destructive, setDestructive] = useState(null)
  const { registry, busy } = state
  async function confirmDestructive() {
    if (destructive?.origin) await manager.remove(destructive.origin)
    else await manager.reset()
    setDestructive(null)
  }
  return (
    <div className="space-y-6">
      {registry.instances.length === 0 ? <EmptyState icon={Server} title="Agrega tu primera instancia" description="Necesitas la URL HTTPS de tu organización. Puedes guardar varias instancias en este dispositivo." variant="compact" /> : (
        <section aria-label="Instancias guardadas" className="space-y-3">
          {registry.instances.map((instance) => (
            <article key={instance.origin} className="rounded-2xl border border-border bg-card p-4 space-y-4">
              <div className="min-w-0"><p className="font-semibold break-words">{instance.name || new URL(instance.origin).hostname}</p><p className="mt-1 text-sm text-muted-foreground break-all">{instance.origin}</p>{registry.activeOrigin === instance.origin && <p className="mt-2 text-xs text-primary font-medium">Instancia activa</p>}</div>
              <div className="flex gap-2"><Button className="flex-1" variant={registry.activeOrigin === instance.origin ? 'default' : 'outline'} disabled={busy} onClick={() => manager.connect(instance.origin)}>{registry.activeOrigin === instance.origin ? 'Continuar' : 'Conectar'}<ArrowRight size={16} /></Button><Button variant="ghost" disabled={busy} aria-label={`Olvidar ${instance.name || instance.origin}`} onClick={() => setDestructive(instance)}><Trash2 size={16} /></Button></div>
            </article>
          ))}
        </section>
      )}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="font-semibold mb-4 flex items-center gap-2"><Plus size={18} />Agregar instancia</h2>
        <form className="space-y-4" onSubmit={(event) => { event.preventDefault(); manager.connect(origin.trim(), name.trim()) }}>
          <TextField id="instance-name" label="Nombre (opcional)" placeholder="Mi organización" value={name} onChange={(event) => setName(event.target.value)} maxLength={80} disabled={busy} />
          <TextField id="instance-origin" label="URL de la instancia" type="url" placeholder="https://runly.example.com" autoCapitalize="none" autoComplete="url" spellCheck={false} value={origin} onChange={(event) => setOrigin(event.target.value)} disabled={busy} required />
          <Button type="submit" className="w-full justify-center" disabled={busy || !origin.trim() || registry.instances.length >= 20}>Verificar y conectar<ArrowRight size={16} /></Button>
        </form>
      </section>
      {registry.instances.length > 0 && <Button variant="ghost" className="text-muted-foreground" disabled={busy} onClick={() => setDestructive({ reset: true })}>Restablecer configuración de instancias</Button>}
      <ConfirmDialog open={!!destructive} onOpenChange={(open) => { if (!open && !busy) setDestructive(null) }} title={destructive?.reset ? '¿Olvidar todas las instancias?' : '¿Olvidar esta instancia?'} description="Se quitará de este dispositivo. Podrás volver a agregarla con su URL." detail={destructive?.origin} confirmLabel="Olvidar" loading={busy} onConfirm={confirmDestructive} />
    </div>
  )
}
