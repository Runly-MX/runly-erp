import { ChevronDown, Download, FileSignature, FileSpreadsheet, MoreHorizontal, QrCode, ShieldCheck, Trash2 } from 'lucide-react'
import {
  Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@runly/ui'

// Bulk actions over the session list. `actions`:
// { canPrint, canCustody, adminActions: [{ key, label }], onPrint, onCustody, onAdmin(key),
//   onExport('csv'|'xlsx'), onClear, exporting, hasMatched, hasRows }
export function ScanSessionActions({ actions, compact = false }) {
  const { canPrint, canCustody, adminActions, onPrint, onCustody, onAdmin, onExport, onClear, exporting, hasMatched, hasRows } = actions

  if (compact) {
    return (
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" disabled={!hasRows}><MoreHorizontal />Acciones</Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          {canPrint ? <DropdownMenuItem className="min-h-11 gap-2" disabled={!hasMatched} onClick={onPrint}><QrCode className="size-4" />Imprimir etiquetas</DropdownMenuItem> : null}
          {canCustody ? <DropdownMenuItem className="min-h-11 gap-2" disabled={!hasMatched} onClick={onCustody}><FileSignature className="size-4" />Crear resguardo</DropdownMenuItem> : null}
          {adminActions.map((a) => (
            <DropdownMenuItem key={a.key} className="min-h-11 gap-2" onClick={() => onAdmin(a.key)}><ShieldCheck className="size-4" />{a.label}</DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem className="min-h-11 gap-2" disabled={exporting} onClick={() => onExport('csv')}><Download className="size-4" />Exportar CSV</DropdownMenuItem>
          <DropdownMenuItem className="min-h-11 gap-2" disabled={exporting} onClick={() => onExport('xlsx')}><FileSpreadsheet className="size-4" />Exportar Excel</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem className="min-h-11 gap-2 text-red-600 focus:text-red-600" onClick={onClear}><Trash2 className="size-4" />Vaciar lista</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    )
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {canPrint ? <Button type="button" size="sm" variant="outline" disabled={!hasMatched} onClick={onPrint}><QrCode />Imprimir etiquetas</Button> : null}
      {canCustody ? <Button type="button" size="sm" variant="outline" disabled={!hasMatched} onClick={onCustody}><FileSignature />Crear resguardo</Button> : null}
      {adminActions.length ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button type="button" size="sm" variant="outline"><ShieldCheck />Cambiar estado<ChevronDown /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel>Aplicar a los encontrados</DropdownMenuLabel>
            {adminActions.map((a) => <DropdownMenuItem key={a.key} onClick={() => onAdmin(a.key)}>{a.label}</DropdownMenuItem>)}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" size="sm" variant="outline" disabled={!hasRows || exporting}><Download />Exportar<ChevronDown /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem className="gap-2" onClick={() => onExport('csv')}><Download className="size-4" />CSV</DropdownMenuItem>
          <DropdownMenuItem className="gap-2" onClick={() => onExport('xlsx')}><FileSpreadsheet className="size-4" />Excel (XLSX)</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button type="button" size="sm" variant="ghost" disabled={!hasRows} onClick={onClear}><Trash2 />Vaciar</Button>
    </div>
  )
}
