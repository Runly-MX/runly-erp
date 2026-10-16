import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, cn } from '@runly/ui'
import { MoreHorizontal, RotateCcw, Save, Star, Trash2 } from 'lucide-react'

// Templates as quick chips (radiogroup, flat-fill selection) with the save
// actions for the current, possibly modified, design.
export function LabelTemplateBar({
  templates, templateId, dirty, canManage, busy, onSelect, onReset, onSaveChanges, onSaveAs, onMakeDefault, onDelete,
}) {
  const template = templates.find((t) => t.id === templateId) ?? null
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 id="label-templates-title" className="text-sm font-semibold">Plantilla</h2>
        {canManage && template ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon" className="h-9 w-9" aria-label="Opciones de la plantilla" disabled={busy}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {!template.isDefault ? <DropdownMenuItem onSelect={onMakeDefault}><Star className="mr-2 h-4 w-4" />Usar como predeterminada</DropdownMenuItem> : null}
              <DropdownMenuItem onSelect={onDelete} className="text-[hsl(var(--destructive))]"><Trash2 className="mr-2 h-4 w-4" />Eliminar plantilla</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>
      <div role="radiogroup" aria-labelledby="label-templates-title" className="flex flex-wrap gap-2">
        {templates.map((t) => {
          const active = t.id === templateId
          return (
            <button key={t.id} type="button" role="radio" aria-checked={active} disabled={busy} onClick={() => onSelect(t.id)}
              className={cn(
                'flex min-h-11 items-center gap-2 rounded-md border px-3 text-left text-sm transition-colors',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] disabled:opacity-50',
                active ? 'border-transparent bg-(--brand-soft) text-(--brand-primary)' : 'border-[hsl(var(--border))] hover:bg-[hsl(var(--muted)/0.6)]',
              )}>
              <span className="font-medium">{t.name}</span>
              <span className={cn('text-xs tabular-nums', active ? 'opacity-80' : 'text-[hsl(var(--muted-foreground))]')}>{Number(t.widthMm)}×{Number(t.heightMm)}</span>
              {t.isDefault ? <Star className="h-3.5 w-3.5 fill-current opacity-70" aria-label="Predeterminada" /> : null}
            </button>
          )
        })}
      </div>
      {dirty ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-[hsl(var(--muted)/0.6)] px-3 py-2 text-xs">
          <span className="mr-auto text-[hsl(var(--muted-foreground))]">Diseño modificado; se imprime así.</span>
          <Button type="button" variant="ghost" size="sm" className="h-9 px-2" disabled={busy} onClick={onReset}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />Descartar
          </Button>
          {canManage && template ? (
            <Button type="button" variant="outline" size="sm" className="h-9 px-2" disabled={busy} onClick={onSaveChanges}>
              <Save className="mr-1.5 h-3.5 w-3.5" />Actualizar «{template.name}»
            </Button>
          ) : null}
        </div>
      ) : null}
      {canManage ? (
        <Button type="button" variant="ghost" size="sm" className="h-9 px-2 text-xs" disabled={busy} onClick={onSaveAs}>
          <Save className="mr-1.5 h-3.5 w-3.5" />Guardar como plantilla
        </Button>
      ) : null}
    </div>
  )
}
