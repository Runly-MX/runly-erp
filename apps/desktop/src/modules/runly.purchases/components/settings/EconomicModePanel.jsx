import { useState } from 'react'
import { Banknote, FileCheck2 } from 'lucide-react'
import { Button, ConfirmDialog, cn } from '@runly/ui'

const MODES = [
  {
    key: 'FINANCIAL', icon: Banknote, title: 'Financiero',
    points: ['Importes, impuestos, saldos y pagos en órdenes y facturas.', 'Elige abajo la plantilla del proceso (Simple, Básico, Compras + Inventario, Completo o Personalizado).'],
  },
  {
    key: 'DOCUMENTARY', icon: FileCheck2, title: 'Control documental',
    points: ['Órdenes y facturas como referencias: solo el nombre o código es obligatorio.', 'Sin importes, impuestos ni pagos; relaciones con Inventarios opcionales.', 'Los documentos financieros que ya existen no se transforman y conservan sus datos.'],
  },
]

// Economic treatment, a dimension apart from the flow template: FINANCIAL
// keeps the current experience; DOCUMENTARY applies the API's "Control
// documental" profile (PUT /purchases/settings { profile }). Switching never
// rewrites existing documents.
export function EconomicModePanel({ mode = 'FINANCIAL', available = true, canManage, saving, onChange }) {
  const [target, setTarget] = useState(null)
  return (
    <section className="space-y-3" aria-labelledby="economic-mode-title">
      <div>
        <h2 id="economic-mode-title" className="text-base font-semibold">Tratamiento económico</h2>
        <p className="text-sm text-[hsl(var(--muted-foreground))]">Independiente de las etapas del proceso. Cambiarlo no modifica los documentos ya registrados.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {MODES.map((m) => {
          const active = mode === m.key
          const blocked = m.key === 'DOCUMENTARY' && !available && !active
          const Icon = m.icon
          return (
            <div key={m.key} className={cn('flex min-w-0 flex-col rounded-2xl border bg-[hsl(var(--card))] p-4', active ? 'border-(--brand-primary) ring-2 ring-(--brand-primary)/15' : 'border-[hsl(var(--border))]')}
              data-economic-mode={m.key} aria-current={active ? 'true' : undefined}>
              <p className="flex items-center gap-2 font-semibold"><Icon className="h-4 w-4 text-(--brand-primary-computed)" aria-hidden />{m.title}{active ? <span className="ml-auto text-xs font-medium text-(--brand-primary-computed)">En uso</span> : null}</p>
              <ul className="mt-2 flex-1 space-y-1 text-sm text-[hsl(var(--muted-foreground))]">
                {m.points.map((point) => <li key={point}>{point}</li>)}
              </ul>
              {blocked ? <p className="mt-3 text-xs text-amber-800 dark:text-amber-300">No disponible en esta instancia: falta aplicar su migración. El modo financiero sigue funcionando.</p> : null}
              {!active && canManage ? (
                <Button className="mt-3 self-start" variant="outline" disabled={blocked || saving} onClick={() => setTarget(m.key)}>
                  {m.key === 'DOCUMENTARY' ? 'Usar Control documental' : 'Volver al modo financiero'}
                </Button>
              ) : null}
            </div>
          )
        })}
      </div>
      <ConfirmDialog open={Boolean(target)} onOpenChange={(open) => { if (!open) setTarget(null) }} tone="primary" loading={saving}
        title={target === 'DOCUMENTARY' ? 'Usar Control documental' : 'Volver al modo financiero'}
        description={target === 'DOCUMENTARY'
          ? 'Las nuevas órdenes y facturas se registrarán como referencias, sin importes ni pagos. Solicitudes, cotizaciones, aprobaciones, recepciones y pagos dejan de ofrecerse. Lo ya registrado no cambia.'
          : 'Las nuevas órdenes y facturas volverán a llevar importes y pagos, con la plantilla Básico (puedes cambiarla después). Las referencias documentales ya registradas siguen siendo documentales.'}
        confirmLabel={target === 'DOCUMENTARY' ? 'Usar Control documental' : 'Volver al modo financiero'}
        onConfirm={() => { onChange(target); setTarget(null) }} />
    </section>
  )
}
