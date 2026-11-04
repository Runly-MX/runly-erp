import { Button, StatusPill } from '@runly/ui'
import { AlertTriangle, ArrowLeft, CheckCircle2, CloudOff, ExternalLink, Eye, FileEdit, Loader2, Rocket } from 'lucide-react'
import { CapabilityButton } from './CapabilityButton.jsx'

const SAVE_ICON = { saving: Loader2, saved: CheckCircle2, error: AlertTriangle, conflict: AlertTriangle, offline: CloudOff, idle: FileEdit }

function hhmm(at) {
  if (!at) return ''
  try { return new Intl.DateTimeFormat('es', { hour: '2-digit', minute: '2-digit' }).format(new Date(at)) } catch { return '' }
}

// Three levels (design 15.3): save status of this session, draft vs published,
// and what is public. "Unsaved local edits" is NOT shown because
// atlas-web-builder 0.2.4 exposes no change/dirty signal or imperative save handle:
// saving stays on the builder's own "Guardar borrador" button (onSaveDraft), and
// "Publicar sitio" here publishes what is already SAVED.
export function EditorTopBar({ title, siteName, status, caps, saveState, onBack, onOpenFull, onPreview, onPublish, readOnlyReason }) {
  const SaveIcon = SAVE_ICON[saveState] ?? FileEdit
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))] px-3 py-2 md:px-4">
      <Button variant="ghost" size="sm" onClick={onBack} aria-label="Volver a Páginas">
        <ArrowLeft className="h-4 w-4" /> <span className="hidden sm:inline">Páginas</span>
      </Button>
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{title}</p>
        <p className="truncate text-xs text-[hsl(var(--muted-foreground))]">{siteName}</p>
      </div>
      <div className="flex flex-wrap items-center gap-1.5" role="status" aria-live="polite" aria-label="Estado del contenido">
        <StatusPill tone={status.save.tone} icon={SaveIcon} size="sm" title="Estado de guardado de esta sesión">
          {status.save.label}{status.save.at && saveState === 'saved' ? ` ${hhmm(status.save.at)}` : ''}
        </StatusPill>
        <StatusPill tone={status.draft.tone} icon={FileEdit} size="sm" title="Tu borrador es privado hasta que publiques.">{status.draft.label}</StatusPill>
        <StatusPill tone={status.published.tone} icon={Rocket} size="sm" title="Lo que ven tus visitantes">{status.published.label}</StatusPill>
      </div>
      <div className="ml-auto flex items-center gap-2">
        {readOnlyReason && <span className="text-xs text-[hsl(var(--muted-foreground))]">{readOnlyReason}</span>}
        {onOpenFull && (
          <Button variant="outline" size="sm" onClick={onOpenFull} title="Abrir el editor solo, en una pestaña nueva">
            <ExternalLink className="h-4 w-4" /> <span className="hidden sm:inline">Pantalla completa</span>
          </Button>
        )}
        <CapabilityButton capability={caps.previewDraft} variant="outline" size="sm" onClick={onPreview}>
          <Eye className="h-4 w-4" /> <span className="hidden sm:inline">Vista previa del sitio</span>
        </CapabilityButton>
        <CapabilityButton capability={caps.publish} size="sm" onClick={onPublish}>
          <Rocket className="h-4 w-4" /> Publicar lo guardado
        </CapabilityButton>
      </div>
    </div>
  )
}
