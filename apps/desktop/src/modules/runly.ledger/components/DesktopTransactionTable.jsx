// apps/desktop/src/modules/runly.ledger/components/DesktopTransactionTable.jsx
import { ArrowDown, ArrowUp, ChevronsUpDown, Inbox } from 'lucide-react'
import { EmptyState } from '@runly/ui'
import CategoryOptions from './CategoryOptions.jsx'
import { DragHandle, RegisterDndContext, useSortableRow } from './SortableRegister.jsx'
import { fmtDecimal, toDateValue } from '../lib/spreadsheet-helpers.js'

const colClass = 'px-2 py-0 h-8 text-xs border-0 bg-transparent focus:outline-none focus:ring-1 focus:ring-[hsl(var(--ring))] rounded w-full'
const thClass = 'px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-[hsl(var(--muted-foreground))] text-left whitespace-nowrap border-b border-[hsl(var(--border))] bg-[hsl(var(--muted))] select-none'
const tdClass = 'border-b border-[hsl(var(--border)/0.5)] p-0 align-middle'

// Desktop spreadsheet-style register: inline-editable grid with keyboard
// navigation (arrow up/down, tab-like Enter, Escape) across cells, plus an
// always-last "new row" for adding a movement without opening a dialog.
// `visibleRowIds` only hides rows (CSS `hidden`) for the search/type/category
// filter strip — it never changes `rows`' array indices, which
// data-row/keyboard navigation in SpreadsheetRegister depends on staying stable.
export default function DesktopTransactionTable({
  tableRef, rows, visibleRowIds, types, categories, canEdit,
  getDraft, setDraft, handleKeyDown, handleRowBlur, saveRow,
  newRow, setNewRow, onDelete, onReorder, dragDisabledReason = null,
  sort = null, onSort, balanceRow = null,
}) {
  const dragDisabled = !canEdit || Boolean(dragDisabledReason)
  const totals = rows.reduce(
    (acc, row) => {
      if (!visibleRowIds || visibleRowIds.has(row.id)) {
        acc.deposito += Number(row.deposito ?? 0)
        acc.retiro += Number(row.retiro ?? 0)
      }
      return acc
    },
    { deposito: 0, retiro: 0 },
  )
  // Sorting reorders `rows`, so the closing balance comes from the register's
  // natural last row, not the last row on screen.
  const lastRow = balanceRow ?? rows[rows.length - 1]

  return (
    <RegisterDndContext ids={rows.map((row) => row.id)} onReorder={onReorder}>
    <table
      ref={tableRef}
      className="w-full min-w-270 border-collapse text-sm"
      onFocus={(e) => {
        const el = e.target
        if (el.tagName === 'INPUT' || el.tagName === 'SELECT') {
          el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
        }
      }}
    >
      <thead className="sticky top-0 z-10">
        <tr>
          <th className={`${thClass} w-8 px-0`} aria-label="Reordenar" />
          <SortTh col="consecutive" label="#" className="w-10 text-center" sort={sort} onSort={onSort} />
          <SortTh col="fecha" label="Fecha" className="w-28" sort={sort} onSort={onSort} />
          <SortTh col="tipo" label="Tipo" className="w-32" sort={sort} onSort={onSort} />
          <SortTh col="numero" label="Numero" className="w-24" sort={sort} onSort={onSort} />
          <SortTh col="nombre" label="Nombre" className="min-w-40" sort={sort} onSort={onSort} />
          <SortTh col="referencia" label="Referencia" className="w-28" sort={sort} onSort={onSort} />
          <SortTh col="concepto" label="Concepto" className="min-w-32" sort={sort} onSort={onSort} />
          <SortTh col="deposito" label="Ingreso" className="w-28 text-right" sort={sort} onSort={onSort} />
          <SortTh col="retiro" label="Egreso" className="w-28 text-right" sort={sort} onSort={onSort} />
          <SortTh col="categoria" label="Categoria" className="w-36" sort={sort} onSort={onSort} />
          {/* Saldo is the running balance of the register's natural order: never sortable. */}
          <th className={`${thClass} w-28 text-right`} title="Saldo acumulado según el orden del registro">Saldo</th>
          <th className={`${thClass} w-8`} />
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && !newRow && (
          <tr>
            <td colSpan={13} className="px-4 py-8">
              <EmptyState
                icon={Inbox}
                title="Sin movimientos"
                description="Aún no hay movimientos en este periodo. Usa Agregar para registrar el primero."
                className="mx-auto max-w-md border-0 py-10 animate-in fade-in zoom-in-95 duration-300 [&>div:first-child]:animate-bounce [&>div:first-child]:[animation-duration:2.4s]"
              />
            </td>
          </tr>
        )}
        {rows.map((row, rowIdx) => {
          const draft = getDraft(row, rowIdx)
          const hiddenByFilter = visibleRowIds && !visibleRowIds.has(row.id)
          return (
            <SortableTr
              key={row.id}
              id={row.id}
              dragDisabled={dragDisabled || row._pending}
              onBlur={(event) => handleRowBlur(event, row, rowIdx)}
              className={`hover:bg-[hsl(var(--muted)/0.4)] odd:bg-[hsl(var(--muted)/0.12)] transition-colors ${hiddenByFilter ? 'hidden' : ''}`}
            >
              {(handleProps) => (<>
              <td className={`${tdClass} px-0.5`}>
                <DragHandle
                  handleProps={handleProps}
                  disabled={dragDisabled || row._pending}
                  disabledReason={dragDisabledReason ?? 'Sin permisos para reordenar'}
                  label={`Reordenar movimiento ${row.consecutive ?? rowIdx + 1}`}
                />
              </td>
              <td className={`${tdClass} text-center text-xs text-[hsl(var(--muted-foreground))]`}>
                {row.consecutive}
              </td>
              <td className={tdClass}>
                <input
                  type="date"
                  aria-label={`Fecha movimiento ${row.consecutive ?? rowIdx + 1}`}
                  className={colClass}
                  data-row={rowIdx}
                  data-col="fecha"
                  disabled={!canEdit}
                  enterKeyHint="next"
                  value={toDateValue(draft.fecha)}
                  onChange={(event) => setDraft(row, rowIdx, 'fecha', event.target.value)}
                  onKeyDown={(event) => handleKeyDown(event, row, rowIdx, 'fecha')}
                />
              </td>
              <td className={tdClass}>
                <select
                  aria-label={`Tipo movimiento ${row.consecutive ?? rowIdx + 1}`}
                  className={colClass}
                  data-row={rowIdx}
                  data-col="tipo_id"
                  disabled={!canEdit}
                  value={draft.tipo_id ?? ''}
                  onChange={(event) => setDraft(row, rowIdx, 'tipo_id', event.target.value || null)}
                  onKeyDown={(event) => handleKeyDown(event, row, rowIdx, 'tipo_id')}
                >
                  <option value="">—</option>
                  {types.map((type) => <option key={type.id} value={type.id}>{type.code}</option>)}
                </select>
              </td>
              <td className={tdClass}>
                <input
                  type="text"
                  aria-label={`Numero movimiento ${row.consecutive ?? rowIdx + 1}`}
                  className={colClass}
                  data-row={rowIdx}
                  data-col="numero"
                  disabled={!canEdit}
                  enterKeyHint="next"
                  value={draft.numero ?? ''}
                  onChange={(event) => setDraft(row, rowIdx, 'numero', event.target.value)}
                  onKeyDown={(event) => handleKeyDown(event, row, rowIdx, 'numero')}
                />
              </td>
              <td className={tdClass}>
                <input
                  type="text"
                  aria-label={`Nombre movimiento ${row.consecutive ?? rowIdx + 1}`}
                  className={colClass}
                  data-row={rowIdx}
                  data-col="nombre"
                  disabled={!canEdit}
                  enterKeyHint="next"
                  value={draft.nombre ?? ''}
                  onChange={(event) => setDraft(row, rowIdx, 'nombre', event.target.value)}
                  onKeyDown={(event) => handleKeyDown(event, row, rowIdx, 'nombre')}
                />
              </td>
              <td className={tdClass}>
                <input
                  type="text"
                  aria-label={`Referencia movimiento ${row.consecutive ?? rowIdx + 1}`}
                  className={colClass}
                  data-row={rowIdx}
                  data-col="referencia"
                  disabled={!canEdit}
                  enterKeyHint="next"
                  value={draft.referencia ?? ''}
                  onChange={(event) => setDraft(row, rowIdx, 'referencia', event.target.value)}
                  onKeyDown={(event) => handleKeyDown(event, row, rowIdx, 'referencia')}
                />
              </td>
              <td className={tdClass}>
                <input
                  type="text"
                  aria-label={`Concepto movimiento ${row.consecutive ?? rowIdx + 1}`}
                  className={colClass}
                  data-row={rowIdx}
                  data-col="concepto"
                  disabled={!canEdit}
                  enterKeyHint="next"
                  value={draft.concepto ?? ''}
                  onChange={(event) => setDraft(row, rowIdx, 'concepto', event.target.value)}
                  onKeyDown={(event) => handleKeyDown(event, row, rowIdx, 'concepto')}
                />
              </td>
              <td className={tdClass}>
                <input
                  type="number"
                  aria-label={`Ingreso movimiento ${row.consecutive ?? rowIdx + 1}`}
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  enterKeyHint="next"
                  className={`${colClass} text-right tabular-nums ${Number(draft.deposito) > 0 ? 'text-success font-semibold' : ''}`}
                  data-row={rowIdx}
                  data-col="deposito"
                  disabled={!canEdit}
                  value={draft.deposito ?? ''}
                  onChange={(event) => setDraft(row, rowIdx, 'deposito', event.target.value)}
                  onKeyDown={(event) => handleKeyDown(event, row, rowIdx, 'deposito')}
                />
              </td>
              <td className={tdClass}>
                <input
                  type="number"
                  aria-label={`Egreso movimiento ${row.consecutive ?? rowIdx + 1}`}
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  enterKeyHint="next"
                  className={`${colClass} text-right tabular-nums ${Number(draft.retiro) > 0 ? 'text-destructive font-semibold' : ''}`}
                  data-row={rowIdx}
                  data-col="retiro"
                  disabled={!canEdit}
                  value={draft.retiro ?? ''}
                  onChange={(event) => setDraft(row, rowIdx, 'retiro', event.target.value)}
                  onKeyDown={(event) => handleKeyDown(event, row, rowIdx, 'retiro')}
                />
              </td>
              <td className={tdClass}>
                <select
                  aria-label={`Categoria movimiento ${row.consecutive ?? rowIdx + 1}`}
                  className={colClass}
                  data-row={rowIdx}
                  data-col="category_id"
                  disabled={!canEdit}
                  value={draft.category_id ?? ''}
                  onChange={(event) => setDraft(row, rowIdx, 'category_id', event.target.value || null)}
                  onKeyDown={(event) => handleKeyDown(event, row, rowIdx, 'category_id')}
                >
                  <CategoryOptions categories={categories} />
                </select>
              </td>
              <td className={`${tdClass} text-right pr-3 text-xs font-mono font-semibold tabular-nums`}>
                {fmtDecimal(row.saldo_actual)}
              </td>
              <td className={`${tdClass} text-center`}>
                <button
                  type="button"
                  aria-label={`Eliminar movimiento ${row.consecutive ?? rowIdx + 1}`}
                  className="text-[hsl(var(--muted-foreground))] hover:text-red-500 text-xs px-1 disabled:opacity-40"
                  disabled={!canEdit}
                  onClick={() => onDelete(row)}
                  title="Eliminar"
                >
                  ×
                </button>
              </td>
              </>)}
            </SortableTr>
          )
        })}

        {newRow && (
          <tr
            onBlur={(event) => {
              const nextFocused = event.relatedTarget
              if (event.currentTarget.contains(nextFocused)) return
              saveRow(newRow, rows.length)
            }}
            className="bg-[hsl(var(--muted)/0.3)]"
          >
            <td className={tdClass} />
            <td className={`${tdClass} text-center text-xs text-[hsl(var(--muted-foreground))]`}>*</td>
            <td className={tdClass}>
              <input
                type="date"
                aria-label="Fecha nuevo movimiento"
                className={colClass}
                autoFocus
                disabled={!canEdit}
                enterKeyHint="next"
                value={newRow.fecha}
                onChange={(event) => setNewRow((row) => ({ ...row, fecha: event.target.value, _dirty: true }))}
                onKeyDown={(event) => { if (event.key === 'Escape') setNewRow(null) }}
              />
            </td>
            <td className={tdClass}>
              <select
                aria-label="Tipo nuevo movimiento"
                className={colClass}
                disabled={!canEdit}
                value={newRow.tipo_id ?? ''}
                onChange={(event) => setNewRow((row) => ({ ...row, tipo_id: event.target.value || null, _dirty: true }))}
              >
                <option value="">—</option>
                {types.map((type) => <option key={type.id} value={type.id}>{type.code}</option>)}
              </select>
            </td>
            <td className={tdClass}>
              <input
                type="text"
                aria-label="Numero nuevo movimiento"
                className={colClass}
                disabled={!canEdit}
                enterKeyHint="next"
                value={newRow.numero}
                onChange={(event) => setNewRow((row) => ({ ...row, numero: event.target.value, _dirty: true }))}
              />
            </td>
            <td className={tdClass}>
              <input
                type="text"
                aria-label="Nombre nuevo movimiento"
                className={colClass}
                placeholder="Nombre *"
                disabled={!canEdit}
                enterKeyHint="next"
                value={newRow.nombre}
                onChange={(event) => setNewRow((row) => ({ ...row, nombre: event.target.value, _dirty: true }))}
              />
            </td>
            <td className={tdClass}>
              <input
                type="text"
                aria-label="Referencia nuevo movimiento"
                className={colClass}
                disabled={!canEdit}
                enterKeyHint="next"
                value={newRow.referencia}
                onChange={(event) => setNewRow((row) => ({ ...row, referencia: event.target.value, _dirty: true }))}
              />
            </td>
            <td className={tdClass}>
              <input
                type="text"
                aria-label="Concepto nuevo movimiento"
                className={colClass}
                disabled={!canEdit}
                enterKeyHint="next"
                value={newRow.concepto}
                onChange={(event) => setNewRow((row) => ({ ...row, concepto: event.target.value, _dirty: true }))}
              />
            </td>
            <td className={tdClass}>
              <input
                type="number"
                aria-label="Ingreso nuevo movimiento"
                min="0"
                step="0.01"
                inputMode="decimal"
                enterKeyHint="next"
                className={`${colClass} text-right tabular-nums ${Number(newRow.deposito) > 0 ? 'text-success font-semibold' : ''}`}
                disabled={!canEdit}
                value={newRow.deposito}
                onChange={(event) => setNewRow((row) => ({ ...row, deposito: event.target.value, _dirty: true }))}
              />
            </td>
            <td className={tdClass}>
              <input
                type="number"
                aria-label="Egreso nuevo movimiento"
                min="0"
                step="0.01"
                inputMode="decimal"
                enterKeyHint="next"
                className={`${colClass} text-right tabular-nums ${Number(newRow.retiro) > 0 ? 'text-destructive font-semibold' : ''}`}
                disabled={!canEdit}
                value={newRow.retiro}
                onChange={(event) => setNewRow((row) => ({ ...row, retiro: event.target.value, _dirty: true }))}
              />
            </td>
            <td className={tdClass}>
              <select
                aria-label="Categoria nuevo movimiento"
                className={colClass}
                disabled={!canEdit}
                value={newRow.category_id ?? ''}
                onChange={(event) => setNewRow((row) => ({ ...row, category_id: event.target.value || null, _dirty: true }))}
              >
                <CategoryOptions categories={categories} />
              </select>
            </td>
            <td className={`${tdClass} text-right pr-3 text-xs`}>—</td>
            <td className={`${tdClass} text-center`}>
              <button type="button" aria-label="Cancelar nuevo movimiento" className="text-xs px-1 hover:text-red-500 disabled:opacity-40" disabled={!canEdit} onClick={() => setNewRow(null)}>
                ×
              </button>
            </td>
          </tr>
        )}
      </tbody>
      {rows.length > 0 && (
        <tfoot>
          <tr className="bg-[hsl(var(--muted))] font-semibold">
            <td className={`${tdClass} text-right border-b-0`} colSpan={8}>
              Totales
            </td>
            <td className={`${tdClass} text-right border-b-0 text-xs tabular-nums text-success`}>
              {fmtDecimal(totals.deposito)}
            </td>
            <td className={`${tdClass} text-right border-b-0 text-xs tabular-nums text-destructive`}>
              {fmtDecimal(totals.retiro)}
            </td>
            <td className={`${tdClass} border-b-0`} />
            <td className={`${tdClass} text-right border-b-0 pr-3 text-xs font-mono tabular-nums`}>
              {fmtDecimal(lastRow?.saldo_actual)}
            </td>
            <td className={`${tdClass} border-b-0`} />
          </tr>
        </tfoot>
      )}
    </table>
    </RegisterDndContext>
  )
}

// Header cell that cycles asc -> desc -> unsorted on click.
function SortTh({ col, label, className = '', sort, onSort }) {
  const active = sort?.key === col
  const Icon = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown
  const right = className.includes('text-right')
  return (
    <th
      className={`${thClass} ${className} p-0`}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort?.(col)}
        title={`Ordenar por ${label}`}
        className={`flex h-full w-full items-center gap-1 px-2 py-1.5 uppercase tracking-wide transition-colors hover:text-[hsl(var(--foreground))] ${right ? 'justify-end' : ''} ${active ? 'text-[hsl(var(--foreground))]' : ''}`}
      >
        {label}
        <Icon size={11} className={active ? 'text-(--brand-primary)' : 'opacity-40'} />
      </button>
    </th>
  )
}

function SortableTr({ id, dragDisabled, className, children, ...props }) {
  const { setNodeRef, style, handleProps, isDragging } = useSortableRow(id, dragDisabled)
  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={`${className} ${isDragging ? 'bg-[hsl(var(--card))] shadow-lg ring-1 ring-(--brand-primary)' : ''}`}
      {...props}
    >
      {children(handleProps)}
    </tr>
  )
}
