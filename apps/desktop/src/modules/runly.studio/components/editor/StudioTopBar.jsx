import { Button, Input, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
  PersonAvatar, ToolButton, Tooltip, TooltipContent, TooltipTrigger, cn } from '@runly/ui'
import { ArrowLeft, Check, CircleDot, Download, Eye, Fullscreen, Loader2, Maximize2, Minimize2, MoreVertical, PanelRight, Redo2, Save, Share2, Undo2 } from 'lucide-react'

export const EXPORTS = [
  { format: 'png', quality: 1, label: 'PNG', hint: 'Sin pérdida, ideal para texto y gráficos' },
  { format: 'jpg', quality: 1, label: 'JPG · 100 %', hint: 'Máxima calidad' },
  { format: 'jpg', quality: 0.9, label: 'JPG · 90 %', hint: 'Recomendado para fotos' },
  { format: 'jpg', quality: 0.7, label: 'JPG · 70 %', hint: 'Archivo ligero' },
]
const VIEW_LABELS = { normal: 'Vista despejada', clean: 'Pantalla completa', fullscreen: 'Vista normal (Esc)' }

function SaveState({ state, live }) {
  const map = {
    saving: { icon: Loader2, text: 'Guardando…', className: 'animate-spin motion-reduce:animate-none' },
    dirty: { icon: CircleDot, text: 'Sin guardar', className: 'text-amber-500' },
    saved: { icon: Check, text: 'Guardado', className: 'text-emerald-600 dark:text-emerald-400' },
  }[state]
  const Icon = map.icon
  return (
    <span role="status" aria-live="polite" className="inline-flex items-center gap-1.5 text-xs text-[hsl(var(--muted-foreground))]">
      <Icon className={cn('h-3.5 w-3.5', map.className)} aria-hidden />{map.text}
      {live ? <span className="hidden lg:inline">· {live}</span> : null}
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

function ExportItems({ onExport }) {
  return EXPORTS.map(option => (
    <DropdownMenuItem key={option.label} onSelect={() => onExport(option.format, option.quality)} className="flex-col items-start gap-0">
      <span className="text-sm font-medium">{option.label}</span>
      <span className="text-xs text-[hsl(var(--muted-foreground))]">{option.hint}</span>
    </DropdownMenuItem>
  ))
}

export function StudioTopBar({ phone, name, onName, nameDisabled, saveState, live, canEdit, onBack, onSave, saveDisabled, onShare, onExport, exporting, exportDisabled,
  history, onUndo, onRedo, participants, inspectorToggle, inspectorOpen, onToggleInspector, viewMode, onCycleViewMode }) {
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
        {canEdit ? <Button size="icon" aria-label={saveState === 'saving' ? 'Guardando' : 'Guardar'} disabled={saveDisabled} onClick={onSave} className="h-10 w-10 shrink-0">
          {saveState === 'saving' ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Save />}
        </Button> : null}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Más opciones" className="h-10 w-10 shrink-0"><MoreVertical /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-60">
            <DropdownMenuLabel className="font-normal"><SaveState state={saveState} live={live} /></DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={onShare} className="gap-2.5"><Share2 className="h-4 w-4" />Compartir</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuLabel>Descargar</DropdownMenuLabel>
            {exportDisabled ? null : <ExportItems onExport={onExport} />}
          </DropdownMenuContent>
        </DropdownMenu>
      </header>
    )
  }
  return (
    <header className="flex h-14 shrink-0 items-center gap-2 border-b border-[hsl(var(--border))] bg-[hsl(var(--card))] px-2 sm:px-3">
      <Button variant="ghost" onClick={onBack} aria-label="Volver a mis diseños" className="h-9 shrink-0 gap-1.5 px-2.5"><ArrowLeft className="h-4 w-4" /><span className="max-lg:sr-only">Diseños</span></Button>
      <span aria-hidden className="h-6 w-px bg-[hsl(var(--border))]" />
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="min-w-0 max-w-xs flex-1">{nameField}</div>
        <SaveState state={saveState} live={live} />
      </div>
      {history_}
      <span aria-hidden className="h-6 w-px bg-[hsl(var(--border))]" />
      <Presence users={participants} />
      <Button variant="outline" onClick={onShare} className="h-9 shrink-0 gap-1.5 px-3"><Share2 className="h-4 w-4" /><span className="max-md:sr-only">Compartir</span></Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" disabled={exportDisabled || exporting} className="h-9 shrink-0 gap-1.5 px-3">
            {exporting ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Download className="h-4 w-4" />}<span className="max-md:sr-only">Descargar</span>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-64"><DropdownMenuLabel>Descargar como</DropdownMenuLabel><ExportItems onExport={onExport} /></DropdownMenuContent>
      </DropdownMenu>
      {canEdit ? <Button onClick={onSave} disabled={saveDisabled} className="h-9 shrink-0 gap-1.5 bg-gradient-to-r from-fuchsia-600 to-violet-600 px-3.5 text-white hover:from-fuchsia-500 hover:to-violet-500">
        {saveState === 'saving' ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : <Save className="h-4 w-4" />}Guardar
      </Button> : null}
      <div className="flex items-center">
        {inspectorToggle ? <ToolButton label={inspectorOpen ? 'Ocultar propiedades' : 'Propiedades'} side="bottom" active={inspectorOpen} onClick={onToggleInspector}><PanelRight /></ToolButton> : null}
        <ToolButton label={VIEW_LABELS[viewMode]} side="bottom" onClick={onCycleViewMode}>
          {viewMode === 'normal' ? <Maximize2 /> : viewMode === 'clean' ? <Fullscreen /> : <Minimize2 />}
        </ToolButton>
      </div>
    </header>
  )
}
