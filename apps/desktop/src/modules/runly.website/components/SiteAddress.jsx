import { Button } from '@runly/ui'
import { Copy, ExternalLink } from 'lucide-react'
import { toast } from 'sonner'

export function copyAddress(hostname) {
  navigator.clipboard.writeText(`https://${hostname}`).then(() => toast.success('Dirección copiada'), () => toast.error('No se pudo copiar'))
}

// Site address as one chip with its quick actions; "Abrir" only when the address is live.
export function SiteAddress({ hostname, ready }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <code className="break-all rounded-lg border border-[hsl(var(--border))] bg-[hsl(var(--background))] px-2.5 py-1 text-xs">{hostname}</code>
      <Button size="sm" variant="outline" onClick={() => copyAddress(hostname)}><Copy className="mr-1.5 h-3.5 w-3.5" aria-hidden />Copiar</Button>
      {ready && <Button size="sm" variant="outline" onClick={() => window.open(`https://${hostname}`, '_blank', 'noopener,noreferrer')}><ExternalLink className="mr-1.5 h-3.5 w-3.5" aria-hidden />Abrir</Button>}
    </div>
  )
}
