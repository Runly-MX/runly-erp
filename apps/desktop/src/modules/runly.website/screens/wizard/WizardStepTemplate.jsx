// apps/desktop/src/modules/runly.website/screens/wizard/WizardStepTemplate.jsx
import { useState } from 'react'
import { Badge, Button, Checkbox } from '@runly/ui'
import { ArrowLeft, FilePlus2, Loader2 } from 'lucide-react'
import { allTemplates } from '../../../../website/runlyTemplates/index.js'

export function WizardStepTemplate({ onNext, onBack, isPending }) {
  const [selectedTemplate, setSelectedTemplate] = useState(null)
  const [selectedPages,    setSelectedPages]    = useState([])

  function handleSelect(tpl) {
    setSelectedTemplate(tpl)
    setSelectedPages(tpl.pages.map((p) => p.id))
  }

  function handleSubmit() {
    onNext({ template: selectedTemplate, selectedPages })
  }

  const toggle = (id, checked) => setSelectedPages((prev) => (checked ? [...prev, id] : prev.filter((x) => x !== id)))

  return (
    <div className="space-y-4">
      {!selectedTemplate ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={handleSubmit}
            className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-[hsl(var(--border))] p-4 text-left transition-colors hover:border-orange-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] sm:col-span-2">
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"><FilePlus2 className="h-5 w-5" aria-hidden /></span>
            <span>
              <span className="block font-semibold">Empezar en blanco</span>
              <span className="block text-sm text-[hsl(var(--muted-foreground))]">Sin plantilla: tú agregas las páginas.</span>
            </span>
          </button>
          {allTemplates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => handleSelect(tpl)}
              className="group overflow-hidden rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--card))] text-left transition-colors hover:border-orange-500/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
            >
              <div className="relative h-24 overflow-hidden" style={{ background: `linear-gradient(135deg, ${tpl.color}, ${tpl.color}aa)` }}>
                <div className="absolute left-3 top-3 right-3 space-y-1.5" aria-hidden>
                  <span className="block h-1.5 w-1/3 rounded-full bg-white/70" />
                  <span className="block h-1.5 w-1/2 rounded-full bg-white/40" />
                  <span className="block h-5 w-16 rounded-md bg-white/80" />
                </div>
                <span className="absolute bottom-2 right-2 rounded-full bg-black/30 px-2 py-0.5 text-[10px] font-medium text-white backdrop-blur-sm">
                  {tpl.pages?.length ?? 0} {tpl.pages?.length === 1 ? 'página' : 'páginas'}
                </span>
              </div>
              <div className="p-3.5">
                <p className="text-sm font-semibold group-hover:text-orange-600 dark:group-hover:text-orange-400">{tpl.label}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-[hsl(var(--muted-foreground))]">{tpl.description}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-2xl border border-orange-500/30 bg-orange-500/5 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className="h-3 w-3 rounded-full" style={{ background: selectedTemplate.color }} />
              <span className="text-sm font-semibold">{selectedTemplate.label}</span>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setSelectedTemplate(null)}>Cambiar plantilla</Button>
          </div>
          <div>
            <p className="mb-2.5 text-sm font-semibold">Páginas a incluir</p>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
              {selectedTemplate.pages.map((p) => (
                <label key={p.id} className={`flex cursor-pointer items-center gap-3 rounded-xl border p-3 transition-colors ${selectedPages.includes(p.id) ? 'border-orange-500/40 bg-orange-500/5' : 'border-[hsl(var(--border))]'}`}>
                  <Checkbox checked={selectedPages.includes(p.id)} disabled={p.required} onCheckedChange={(checked) => toggle(p.id, Boolean(checked))} aria-label={`Incluir ${p.label}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{p.label}</p>
                    <p className="font-mono text-xs text-[hsl(var(--muted-foreground))]">{p.routePath}</p>
                  </div>
                  {p.required && <Badge variant="warning">Requerida</Badge>}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-1">
        {onBack && <Button variant="outline" className="flex-1" onClick={onBack}><ArrowLeft className="mr-1.5 h-4 w-4" aria-hidden />Atrás</Button>}
        {selectedTemplate && (
          <Button className="flex-1" disabled={isPending} onClick={handleSubmit}>
            {isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden />}
            {isPending ? 'Creando sitio…' : `Crear con ${selectedPages.length} página${selectedPages.length !== 1 ? 's' : ''}`}
          </Button>
        )}
      </div>
    </div>
  )
}
