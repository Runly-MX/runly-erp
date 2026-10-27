import { useState } from 'react'
import { Button, Input, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  ToolButton, Tooltip, TooltipContent, TooltipTrigger } from '@runly/ui'
import { ExportDialog } from './ExportDialog.jsx'
import { PresenceStack } from './collaboration/PresenceStack.jsx'
import { SyncStatus } from './collaboration/SyncStatus.jsx'
import { ArrowLeft, LayoutTemplate, Download, Eye, Fullscreen, Loader2, Maximize2, Minimize2, MoreVertical, PanelRight, Redo2, Share2, Undo2 } from 'lucide-react'

const VIEW_LABELS = { normal: 'Vista despejada', clean: 'Pantalla completa', fullscreen: 'Vista normal (Esc)' }

export function StudioTopBar({ phone, name, onName, nameDisabled, syncState, live, canEdit, onBack, onRetrySync, onShare, onCredits, onSaveTemplate, onExport, exporting, exportDisabled,
  history, onUndo, onRedo, people, objects, inspectorToggle, inspectorOpen, onToggleInspector, viewMode, onCycleViewMode, page, pages = [], pageCount = 1, packageExport = null }) {
  const [exportOpen, setExportOpen] = useState(false)
  // onExport(options): screen (PNG/JPG) or print PDF, chosen in ExportDialog.
  const exportDialog = page ? <ExportDialog open={exportOpen} onOpenChange={setExportOpen} page={page} pages={pages} pageCount={pageCount} exporting={exporting} packageExport={packageExport}
    onExport={options => { setExportOpen(false); onExport(options) }} onCredits={() => { setExportOpen(false); onCredits() }} /> : null
  const nameField = (
    <Input aria-label="Nombre del diseño" value={name} maxLength={160} disabled={nameDisabled} onChange={event => onName(event.target.value)}
      className="h-9 w-full min-w-0 truncate border-transparent bg-transparent px-2 font-semibold shadow-none hover:border-[hsl(var(--border))] disabled:opacity-100 sm:text-sm" />
  )
  const history_ = canEdit ? (
    <div role="group" aria-label="Historial" className="flex items-center">
      <ToolButton label="Deshacer" shortcut="Ctrl+Z" side="bottom" disabled={!history.canUndo} onClick={onUndo} className={phone ? 'h-10 w-10' : undefined}><Undo2 /></ToolButton>
      <ToolButton label="Rehacer" shortcut="Ctrl+Y" side="bottom" disabled={!history.canRedo} onClick={onRedo} className={phone ? 'h-10 w-10' : undefined}><Redo2 /></ToolButton>
    </div>
  ) : (
    <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-[hsl(var(--muted))] px-3 text-xs font-medium text-[hsl(var(--muted-foreground))]">
      <Eye className="h-3.5 w-3.5" /><span className="max-sm:sr-only">Solo lectura</span>
    </span>
  )
  if (phone) {
    return (
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-1.5">
        <Button variant="ghost" size="icon" aria-label="Volver a mis diseños" onClick={onBack} className="h-10 w-10 shrink-0"><ArrowLeft /></Button>
        <div className="min-w-0 flex-1">{nameField}</div>
        {history_}
        <PresenceStack people={people} objects={objects} compact />
        <SyncStatus state={syncState} live={live} onRetry={onRetrySync} compact />
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Más opciones" className="h-10 w-10 shrink-0"><MoreVertical /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-60">
            <DropdownMenuLabel className="font-normal"><SyncStatus state={syncState} live={live} onRetry={onRetrySync} /></DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onShare} className="gap-2.5"><Share2 className="h-4 w-4" />Compartir</DropdownMenuItem>
            {onSaveTemplate ? <DropdownMenuItem onSelect={onSaveTemplate} className="gap-2.5"><LayoutTemplate className="h-4 w-4" />Guardar como plantilla</DropdownMenuItem> : null}
            <DropdownMenuItem onSelect={onCredits}>Créditos del diseño</DropdownMenuItem>
            <DropdownMenuItem disabled={exportDisabled} onSelect={() => setExportOpen(true)} className="gap-2.5"><Download className="h-4 w-4" />Descargar…</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        {exportDialog}
      </header>
    )
  }
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 sm:px-3">
      <Button variant="ghost" onClick={onBack} aria-label="Volver a mis diseños" className="h-9 shrink-0 gap-1.5 px-2.5"><ArrowLeft className="h-4 w-4" /><span className="max-lg:sr-only">Diseños</span></Button>
      <span aria-hidden className="h-6 w-px bg-[hsl(var(--border))]" />
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="min-w-0 max-w-xs flex-1">{nameField}</div>
        <SyncStatus state={syncState} live={live} onRetry={onRetrySync} />
      </div>
      {history_}
      <span aria-hidden className="h-6 w-px bg-[hsl(var(--border))]" />
      <PresenceStack people={people} objects={objects} />
      {onSaveTemplate ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button variant="outline" onClick={onSaveTemplate} className="h-9 shrink-0 gap-1.5 px-3"><LayoutTemplate className="h-4 w-4" /><span className="max-xl:sr-only">Guardar como plantilla</span></Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">Guardar como plantilla personal o de tu empresa</TooltipContent>
        </Tooltip>
      ) : null}
      <Button variant="outline" onClick={onShare} className="h-9 shrink-0 gap-1.5 px-3"><Share2 className="h-4 w-4" /><span className="max-md:sr-only">Compartir</span></Button>
      <Button variant="outline" disabled={exportDisabled || exporting} onClick={() => setExportOpen(true)} className="h-9 shrink-0 gap-1.5 px-3">
        {exporting ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Download className="h-4 w-4" />}<span className="max-md:sr-only">Descargar</span>
      </Button>
      {exportDialog}
      <div className="flex items-center">
        {inspectorToggle ? <ToolButton label={inspectorOpen ? 'Ocultar propiedades' : 'Propiedades'} side="bottom" active={inspectorOpen} onClick={onToggleInspector}><PanelRight /></ToolButton> : null}
        <ToolButton label={VIEW_LABELS[viewMode]} side="bottom" onClick={onCycleViewMode}>
          {viewMode === 'normal' ? <Maximize2 /> : viewMode === 'clean' ? <Fullscreen /> : <Minimize2 />}
        </ToolButton>
      </div>
    </header>
  )
}
