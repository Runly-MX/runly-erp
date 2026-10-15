import { ChevronRight, Eye, MoreHorizontal, Plus, Trash2 } from 'lucide-react'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@runly/ui'
import { Link } from 'react-router-dom'
import { formHeaderModel } from '../lib/form-header.js'

export const INVENTORY_FORM_ID = 'inventory-item-form'

// Sticky header of the create/edit screen: breadcrumb, title/subtitle and the
// save/cancel actions (the submit button targets the RunlyForm by id). Edit
// mode adds "Ver detalle" and a "Más acciones" menu.
export function InventoryFormHeader({ isEdit, item, id, onCancel, onView, onNew, onDeactivate }) {
  const model = formHeaderModel({ isEdit, item, id })
  return (
    <header className="sticky top-0 z-20 -mx-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--background))]/90 px-4 py-3 backdrop-blur md:-mx-6 md:px-6">
      <nav aria-label="Ruta" className="mb-1 flex min-w-0 flex-wrap items-center gap-1 text-xs text-[hsl(var(--muted-foreground))]">
        {model.crumbs.map((crumb, index) => (
          <span key={`${crumb.label}-${index}`} className="flex min-w-0 items-center gap-1">
            {index > 0 ? <ChevronRight className="h-3 w-3 shrink-0" aria-hidden="true" /> : null}
            {crumb.to ? (
              <Link to={crumb.to} className="max-w-[16rem] truncate hover:text-[hsl(var(--foreground))] hover:underline">{crumb.label}</Link>
            ) : (
              <span className="max-w-[16rem] truncate text-[hsl(var(--foreground))]" aria-current={index === model.crumbs.length - 1 ? 'page' : undefined}>{crumb.label}</span>
            )}
          </span>
        ))}
      </nav>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-semibold tracking-tight text-[hsl(var(--foreground))]">{model.title}</h1>
          {model.subtitle ? <p className="truncate text-sm text-[hsl(var(--muted-foreground))]">{model.subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isEdit ? (
            <>
              <Button type="button" variant="ghost" size="sm" onClick={onView} className="hidden sm:inline-flex"><Eye className="mr-1.5 h-4 w-4" />Ver detalle</Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" aria-label="Más acciones"><MoreHorizontal className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Más acciones</span></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={onView} className="sm:hidden"><Eye className="mr-2 h-4 w-4" />Ver detalle</DropdownMenuItem>
                  <DropdownMenuItem onSelect={onNew}><Plus className="mr-2 h-4 w-4" />Nuevo inventario</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={onDeactivate} className="text-red-600 focus:text-red-600"><Trash2 className="mr-2 h-4 w-4" />Desactivar activo</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          ) : null}
          <Button type="button" variant="outline" size="sm" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" form={INVENTORY_FORM_ID} size="sm">Guardar</Button>
        </div>
      </div>
    </header>
  )
}
