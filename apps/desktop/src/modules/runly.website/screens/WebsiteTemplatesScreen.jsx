// apps/desktop/src/modules/runly.website/screens/WebsiteTemplatesScreen.jsx
import { useNavigate } from 'react-router-dom'
import { PageHeader } from '@runly/ui'
import { LayoutTemplate } from 'lucide-react'
import { allTemplates } from '../../../website/runlyTemplates/index.js'

export default function WebsiteTemplatesScreen() {
  const navigate = useNavigate()

  return (
    <div className="p-4 md:p-6 space-y-6">
      <PageHeader
        eyebrow="Runly Website"
        title="Plantillas"
        description="Selecciona una plantilla para previsualizarla y elegir las paginas que deseas crear."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
        {allTemplates.map((tpl) => (
          <button
            key={tpl.id}
            onClick={() => navigate(`/app/m/runly.website/templates/${tpl.id}/preview`)}
            className="text-left rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 hover:shadow-md transition-all group"
          >
            <div
              className="aspect-video relative overflow-hidden flex items-center justify-center"
              style={{ background: `linear-gradient(135deg, ${tpl.color}22, ${tpl.color}44)` }}
            >
              <LayoutTemplate size={36} style={{ color: tpl.color }} className="opacity-40"/>
              <div
                className="absolute top-2 right-2 text-[10px] font-semibold px-2 py-0.5 rounded-full text-white"
                style={{ background: tpl.color }}
              >
                {tpl.pages.length} pag{tpl.pages.length !== 1 ? 's' : ''}
              </div>
            </div>
            <div className="p-4">
              <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">{tpl.label}</h3>
              <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{tpl.description}</p>
              <p className="text-xs text-muted-foreground mt-2">Clic para previsualizar</p>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}
