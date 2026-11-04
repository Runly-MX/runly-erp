// apps/desktop/src/modules/runly.website/screens/WebsiteTemplatesScreen.jsx
import { useNavigate } from 'react-router-dom'
import { LayoutTemplate } from 'lucide-react'
import { allTemplates } from '../../../website/runlyTemplates/index.js'
import { SiteSectionHeader } from '../components/SiteSectionHeader.jsx'
import { TemplatesCard } from '../components/TemplatesCard.jsx'

export default function WebsiteTemplatesScreen({siteId}) {
  const navigate = useNavigate()

  return (
    <div className="space-y-5 p-4 md:p-6">
      <SiteSectionHeader
        icon={LayoutTemplate}
        tone="amber"
        title="Plantillas"
        description="Elige un punto de partida: previsualiza una plantilla y decide qué páginas crear."
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {allTemplates.map((tpl) => (
          <TemplatesCard
            key={tpl.id}
            template={tpl}
            onPreview={() => navigate(`/app/m/runly.website/templates/${tpl.id}/preview${siteId?`?siteId=${encodeURIComponent(siteId)}`:''}`)}
          />
        ))}
      </div>
    </div>
  )
}
