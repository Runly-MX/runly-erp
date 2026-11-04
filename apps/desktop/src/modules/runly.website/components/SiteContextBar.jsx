import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@runly/ui'
import { ChevronDown, Eye, Globe, Rocket } from 'lucide-react'
import { SiteStatusChip } from './SiteStatusChip.jsx'
import { CapabilityButton } from './CapabilityButton.jsx'
import { PendingChangesDialog } from './PendingChangesDialog.jsx'
import { PUBLIC_ROUTE_ROOT, sitePath } from '../lib/pageRoute.js'

// Persistent context for every section of a site: which site, whether the
// draft differs from what is public, and the two primary actions.
export function SiteContextBar({ site, sites = [], state, caps, onPublish, onPreview, publishing }) {
  const navigate = useNavigate()
  const [pendingOpen, setPendingOpen] = useState(false)
  const others = sites.filter((item) => item.id !== site?.id)
  const archived = state?.key === 'archived'
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))] px-4 py-3 md:px-6">
      <nav aria-label="Ubicación" className="flex min-w-0 items-center gap-1.5 text-sm">
        <button
          type="button"
          onClick={() => navigate(PUBLIC_ROUTE_ROOT)}
          className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))]"
        >
          <Globe className="h-3.5 w-3.5" aria-hidden="true" /> Mis sitios
        </button>
        <span aria-hidden="true" className="text-[hsl(var(--muted-foreground))]">/</span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="inline-flex min-w-0 max-w-[16rem] items-center gap-1 rounded-md px-1.5 py-1 font-semibold hover:bg-[hsl(var(--muted))]"
              aria-label={`Sitio actual: ${site?.name ?? ''}. Cambiar de sitio`}
            >
              <span className="truncate">{site?.name ?? 'Cargando…'}</span>
              <ChevronDown className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[14rem]">
            <DropdownMenuLabel>Cambiar de sitio</DropdownMenuLabel>
            {others.length === 0 && <div className="px-2 py-1.5 text-xs text-[hsl(var(--muted-foreground))]">No hay otros sitios.</div>}
            {others.map((item) => (
              <DropdownMenuItem key={item.id} onSelect={() => navigate(sitePath(item.id, 'overview'))}>
                {item.name}{item.defaultForCompany ? ' · predeterminado' : ''}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate(PUBLIC_ROUTE_ROOT)}>Ver todos los sitios</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
      {state?.hasPending && site?.changes?.length ? (<>
        <button type="button" onClick={() => setPendingOpen(true)} className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]" aria-label="Ver qué cambios faltan por publicar">
          <SiteStatusChip state={state} />
        </button>
        <PendingChangesDialog open={pendingOpen} onOpenChange={setPendingOpen} site={site} caps={caps} onPublish={onPublish} />
      </>) : <SiteStatusChip state={state} />}
      <div className="ml-auto flex items-center gap-2">
        <CapabilityButton capability={caps?.previewSite} variant="outline" size="sm" onClick={onPreview} disabled={archived}>
          <Eye className="h-4 w-4" /> <span className="hidden sm:inline">Vista previa</span>
        </CapabilityButton>
        <CapabilityButton capability={caps?.publish} size="sm" onClick={onPublish} disabled={archived || publishing}>
          <Rocket className="h-4 w-4" /> Publicar
        </CapabilityButton>
      </div>
    </div>
  )
}
