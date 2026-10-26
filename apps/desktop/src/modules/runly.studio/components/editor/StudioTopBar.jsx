import { useState } from 'react'
import { Button, Input, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  PersonAvatar, ToolButton, Tooltip, TooltipContent, TooltipTrigger, cn } from '@runly/ui'
import { ExportDialog } from './ExportDialog.jsx'
import { ArrowLeft, LayoutTemplate, Check, CloudOff, Download, Eye, Fullscreen, Loader2, Maximize2, Minimize2, MoreVertical, PanelRight, Redo2, RefreshCw, Share2, TriangleAlert, Undo2 } from 'lucide-react'

const VIEW_LABELS = { normal: 'Vista despejada', clean: 'Pantalla completa', fullscreen: 'Vista normal (Esc)' }

// Real-time sync state: every change is shared automatically (no save button).
const SYNC = {
  synced: { icon: Check, text: 'Sincronizado', className: 'text-emerald-600 dark:text-emerald-400' },
  syncing: { icon: Loader2, text: 'Sincronizando…', className: 'animate-spin motion-reduce:animate-none' },
  offline: { icon: CloudOff, text: 'Sin conexión · se enviará al reconectar', className: 'text-amber-500' },
  error: { icon: TriangleAlert, text: 'Error al sincronizar', className: 'text-[hsl(var(--destructive))]' },
}
function SyncState({ state, live, onRetry, compact = false }) {
  const map = SYNC[state] ?? SYNC.synced, Icon = map.icon
  return (
    <span role="status" aria-live="polite" aria-label={compact ? map.text : undefined} title={compact ? map.text : undefined}
      className="inline-flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
      <Icon className={cn('h-3.5 w-3.5 shrink-0', map.className)} aria-hidden />{compact ? null : map.text}
      {!compact && live && (state === 'synced' || state === 'syncing') ? <span className="hidden lg:inline">· {live}</span> : null}
      {state === 'error' && onRetry && !compact ? <Button size="sm" variant="ghost" onClick={onRetry} className="h-7 gap-1 px-2 text-xs"><RefreshCw className="h-3 w-3" />Reintentar</Button> : null}
    </span>
  )
}

function Presence({ users }) {
  if (!users.length) return null
  const visible = users.slice(0, 3), extra = users.length - visible.length
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div role="img" aria-label={`${users.length} persona(s) editando`} className="flex -space-x-2">
          {visible.map(user => <PersonAvatar key={user.userId} name={user.name} src={user.avatarUrl ?? null} size="md" className="h-8 w-8 ring-2 ring-fuchsia-500" />)}
          {extra > 0 ? <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[hsl(var(--muted))] text-[11px] font-semibold ring-2 ring-[hsl(var(--card))]">+{extra}</span> : null}
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom">{users.map(user => user.name).join(', ')}</TooltipContent>
    </Tooltip>
  )
}

export function StudioTopBar({ phone, name, onName, nameDisabled, syncState, live, canEdit, onBack, onRetrySync, onShare, onCredits, onSaveTemplate, onExport, exporting, exportDisabled,
  history, onUndo, onRedo, participants, inspectorToggle, inspectorOpen, onToggleInspector, viewMode, onCycleViewMode, page }) {
  const [exportOpen, setExportOpen] = useState(false)
  // onExport(options): screen (PNG/JPG) or print PDF, chosen in ExportDialog.
  const exportDialog = page ? <ExportDialog open={exportOpen} onOpenChange={setExportOpen} page={page} exporting={exporting}
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
        <span className="flex h-10 w-8 shrink-0 items-center justify-center"><SyncState state={syncState} compact /></span>
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Más opciones" className="h-10 w-10 shrink-0"><MoreVertical /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-60">
            <DropdownMenuLabel className="font-normal"><SyncState state={syncState} live={live} onRetry={onRetrySync} /></DropdownMenuLabel>
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
        <SyncState state={syncState} live={live} onRetry={onRetrySync} />
      </div>
      {history_}
      <span aria-hidden className="h-6 w-px bg-[hsl(var(--border))]" />
      <Presence users={participants} />
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
