// apps/desktop/src/modules/runly.website/screens/wizard/WizardStepTemplate.jsx
import { useState } from 'react'
import { Badge } from '@runly/ui'
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

  return (
    <div className="space-y-4">
      {!selectedTemplate ? (
        <div className="grid grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
          {allTemplates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => handleSelect(tpl)}
              className="text-left rounded-2xl border-2 border-border hover:border-primary/40 hover:shadow-lg overflow-hidden transition-all duration-200 group bg-card"
            >
              <div className="h-24 relative overflow-hidden" style={{ background: `linear-gradient(135deg, ${tpl.color}, ${tpl.color}aa)` }}>
                <div className="absolute top-2 right-2 bg-black/30 backdrop-blur-sm text-white text-[10px] font-medium px-2 py-0.5 rounded-full">
                  {tpl.pages?.length ?? 0} pag
                </div>
              </div>
              <div className="p-3.5">
                <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors">{tpl.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{tpl.description}</p>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-primary/5 border border-primary/20 rounded-2xl px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="w-3 h-3 rounded-full" style={{ background: selectedTemplate.color }}/>
              <span className="text-sm font-semibold text-primary">{selectedTemplate.label}</span>
            </div>
            <button type="button" onClick={() => setSelectedTemplate(null)}
              className="text-xs text-primary/70 hover:text-primary font-semibold transition-colors">
              Cambiar plantilla
            </button>
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground mb-2.5">Páginas a incluir</p>
            <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
              {selectedTemplate.pages.map((p) => (
                <label
                  key={p.id}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                    selectedPages.includes(p.id) ? 'border-primary/30 bg-primary/5' : 'border-border bg-card/50'
                  } ${p.required ? 'opacity-75' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={selectedPages.includes(p.id)}
                    disabled={p.required}
                    onChange={(e) => {
                      if (e.target.checked) setSelectedPages((prev) => [...prev, p.id])
                      else setSelectedPages((prev) => prev.filter((id) => id !== p.id))
                    }}
                    className="w-4 h-4 rounded accent-primary"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground">{p.label}</p>
                    <p className="text-xs text-muted-foreground font-mono">{p.routePath}</p>
                  </div>
                  {p.required && (
                    <Badge variant="warning">Requerida</Badge>
                  )}
                </label>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex gap-3 pt-2">
        {onBack && (
          <button type="button" onClick={onBack}
            className="flex-1 py-3 rounded-xl font-semibold text-sm text-foreground border-2 border-border hover:bg-muted transition-all">
            Atrás
          </button>
        )}
        <button
          type="button"
          disabled={isPending}
          onClick={handleSubmit}
          className="flex-1 py-3 rounded-xl font-semibold text-sm bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-60 transition-all flex items-center justify-center gap-2"
        >
          {isPending ? (
            <>
              <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25"/>
                <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round"/>
              </svg>
              Creando sitio...
            </>
          ) : selectedTemplate
            ? `Crear con ${selectedPages.length} página${selectedPages.length !== 1 ? 's' : ''}`
            : 'Crear sitio en blanco'}
        </button>
      </div>
    </div>
  )
}
