import { ChevronDown, Download, FileSignature, FileSpreadsheet, Loader2, MoreHorizontal, Printer, ShieldCheck, Trash2 } from 'lucide-react'
import {
  Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, cn,
} from '@runly/ui'
import { plural } from '../labels/studio-ui.jsx'

// Height of the phone bar without the safe area (the PeekSheet sits on top of it).
export const MOBILE_BAR_HEIGHT = '4.5rem'

// Bulk actions over the session list. `actions`:
// { canPrint, canCustody, adminActions: [{ key, label }], onPrint, onCustody, onAdmin(key),
//   onExport('csv'|'xlsx'), onClear, exporting, hasMatched, hasRows }
function ExportMenu({ actions, compact }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className="h-11" disabled={!actions.hasRows || actions.exporting} aria-label="Exportar lista">
          {actions.exporting ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" /> : <Download className="size-4" />}
          {compact ? null : <><span className="ml-2">Exportar</span><ChevronDown className="ml-1.5 size-3.5" /></>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-48">
        <DropdownMenuItem className="min-h-10 gap-2" onSelect={() => actions.onExport('csv')}><Download className="size-4" />CSV</DropdownMenuItem>
        <DropdownMenuItem className="min-h-10 gap-2" onSelect={() => actions.onExport('xlsx')}><FileSpreadsheet className="size-4" />Excel (XLSX)</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function PrimaryAction({ actions, className }) {
  if (actions.canPrint) {
    return <Button type="button" className={cn('h-11 px-5', className)} disabled={!actions.hasMatched} onClick={actions.onPrint}><Printer className="mr-2 size-4" />Imprimir etiquetas</Button>
  }
  if (actions.canCustody) {
    return <Button type="button" className={cn('h-11 px-5', className)} disabled={!actions.hasMatched} onClick={actions.onCustody}><FileSignature className="mr-2 size-4" />Crear resguardo</Button>
  }
  return <Button type="button" className={cn('h-11 px-5', className)} disabled={!actions.hasRows || actions.exporting} onClick={() => actions.onExport('xlsx')}><FileSpreadsheet className="mr-2 size-4" />Exportar Excel</Button>
}

export function ScanActionBar({ actions, counts }) {
  const { canPrint, canCustody, adminActions, hasMatched, hasRows } = actions
  const summary = counts.total
    ? `${plural(counts.matched, 'encontrado', 'encontrados')}${counts.unmatched ? ` · ${plural(counts.unmatched, 'no encontrado', 'no encontrados')}` : ''}`
    : 'Lista vacía'
  return (
    <>
      {hasRows ? (
        <div className="sticky bottom-0 z-30 hidden border-t border-[hsl(var(--border))] bg-[hsl(var(--card)/0.96)] backdrop-blur lg:block">
          <div className="flex items-center gap-3 px-5 py-3">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold tabular-nums">{plural(counts.total, 'código en la lista', 'códigos en la lista')}</p>
              <p className="truncate text-xs tabular-nums text-[hsl(var(--muted-foreground))]">
                {hasMatched ? `${summary}. Las acciones usan los encontrados.` : 'Ningún código se encontró; solo puedes exportar.'}
              </p>
            </div>
            <ExportMenu actions={actions} />
            {adminActions.length ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" className="h-11"><ShieldCheck className="mr-2 size-4" />Cambiar estado<ChevronDown className="ml-1.5 size-3.5" /></Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" side="top" className="w-56">
                  <DropdownMenuLabel>Aplicar a los encontrados</DropdownMenuLabel>
                  {adminActions.map((a) => <DropdownMenuItem key={a.key} className="min-h-10" onSelect={() => actions.onAdmin(a.key)}>{a.label}</DropdownMenuItem>)}
                </DropdownMenuContent>
              </DropdownMenu>
            ) : null}
            {canPrint && canCustody ? (
              <Button type="button" variant="outline" className="h-11" disabled={!hasMatched} onClick={actions.onCustody}><FileSignature className="mr-2 size-4" />Crear resguardo</Button>
            ) : null}
            <PrimaryAction actions={actions} />
          </div>
        </div>
      ) : null}

      <nav aria-label="Acciones de la lista"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-[hsl(var(--border))] bg-[hsl(var(--card))] pb-[var(--sab)] shadow-[0_-4px_16px_rgb(0_0_0/0.06)] lg:hidden">
        <div className="flex items-center gap-2 px-4" style={{ height: MOBILE_BAR_HEIGHT }}>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" className="h-11 shrink-0" disabled={!hasRows}><MoreHorizontal className="mr-2 size-4" />Acciones</Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="top" className="w-64">
              {canPrint && canCustody ? <DropdownMenuItem className="min-h-11 gap-2" disabled={!hasMatched} onSelect={actions.onCustody}><FileSignature className="size-4" />Crear resguardo</DropdownMenuItem> : null}
              {adminActions.length ? <DropdownMenuLabel>Cambiar estado</DropdownMenuLabel> : null}
              {adminActions.map((a) => (
                <DropdownMenuItem key={a.key} className="min-h-11 gap-2" onSelect={() => actions.onAdmin(a.key)}><ShieldCheck className="size-4" />{a.label}</DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem className="min-h-11 gap-2" disabled={actions.exporting} onSelect={() => actions.onExport('csv')}><Download className="size-4" />Exportar CSV</DropdownMenuItem>
              <DropdownMenuItem className="min-h-11 gap-2" disabled={actions.exporting} onSelect={() => actions.onExport('xlsx')}><FileSpreadsheet className="size-4" />Exportar Excel</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="min-h-11 gap-2 text-red-700 focus:text-red-700 dark:text-red-300" onSelect={actions.onClear}><Trash2 className="size-4" />Vaciar lista</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <PrimaryAction actions={actions} className="min-w-0 flex-1" />
        </div>
      </nav>
    </>
  )
}
