import { useEffect, useRef, useState } from 'react'
import { Button, FieldWrapper, Input, SortableList, cn } from '@runly/ui'
import { Plus, Trash2 } from 'lucide-react'
import { MAX_ITEMS, insertRow, removeRow, reorderRows, updateRow } from '../../lib/lmsQuestionForm.js'
import { DragHandle } from '../curriculum/DragHandle.jsx'

const ROW_LIMITS = { options: 2, accepted: 1, items: 2, pairs: 2 }

// Editable, sortable rows of a question form field (`options`, `accepted`,
// `items` or `pairs`). Enter in a row adds a new one below and focuses it.
// `marker(row, index)` renders the "Correcta" control of choice rows;
// `sortable` false hides the grips (accepted answers have no order).
export function RowListEditor({
  form, field, onChange, label, hint, error, required = true, marker, placeholder, sortable = true, addLabel = 'Agregar', disabled = false,
}) {
  const rows = form[field]
  const min = ROW_LIMITS[field] ?? 1
  const container = useRef(null)
  const [focusKey, setFocusKey] = useState(null)

  useEffect(() => {
    if (!focusKey) return
    container.current?.querySelector(`[data-row-key="${focusKey}"]`)?.focus()
    setFocusKey(null)
  }, [focusKey])

  function add(afterIndex) {
    const next = insertRow(form, field, afterIndex)
    if (next === form) return
    onChange(next)
    setFocusKey(next[field][afterIndex + 1].key)
  }

  function onKeyDown(event, index) {
    if (event.key !== 'Enter' || event.nativeEvent?.isComposing) return
    event.preventDefault()
    add(index)
  }

  const input = (row, index, key, text, aria) => (
    <Input
      data-row-key={key === 'match' ? undefined : row.key}
      aria-label={aria} placeholder={aria} value={text} maxLength={500} autoComplete="off" disabled={disabled}
      onChange={(event) => onChange(updateRow(form, field, index, { [key]: event.target.value }))}
      onKeyDown={(event) => onKeyDown(event, index)}
      className="h-9 min-w-0 rounded-md"
    />
  )

  const renderRow = (row, { dragHandleProps, isDragging, index }) => (
    <div className={cn('flex items-center gap-2 rounded-md bg-[hsl(var(--background))] py-1', isDragging && 'opacity-80 shadow-sm')}>
      {sortable && !disabled ? <DragHandle handleProps={dragHandleProps} label={`Mover ${placeholder(index).toLowerCase()}`} /> : null}
      {marker ? marker(row, index) : null}
      {field === 'pairs' ? (
        <div className="grid min-w-0 flex-1 grid-cols-1 gap-1.5 sm:grid-cols-2">
          {input(row, index, 'text', row.text, `Elemento ${index + 1}`)}
          {input(row, index, 'match', row.match, `Pareja de ${index + 1}`)}
        </div>
      ) : (
        <div className="min-w-0 flex-1">{input(row, index, 'text', row.text, placeholder(index))}</div>
      )}
      {!disabled ? (
        <Button
          type="button" variant="ghost" size="icon-sm" aria-label={`Quitar ${placeholder(index).toLowerCase()}`} title="Quitar"
          className="shrink-0 text-[hsl(var(--destructive))]" onClick={() => onChange(removeRow(form, field, index))} disabled={rows.length <= min}
        >
          <Trash2 />
        </Button>
      ) : null}
    </div>
  )

  return (
    <FieldWrapper label={label} required={required} error={error} hint={hint}>
      <div ref={container} className="space-y-0.5">
        {field === 'pairs' ? (
          <div className="hidden grid-cols-2 gap-1.5 pl-10 pr-10 text-xs font-medium text-[hsl(var(--muted-foreground))] sm:grid">
            <span>Izquierda</span><span>Derecha (respuesta)</span>
          </div>
        ) : null}
        <SortableList
          items={rows} getId={(row) => row.key} disabled={!sortable || disabled}
          labelOf={(row) => row.text} renderItem={renderRow}
          onReorder={(next) => onChange(reorderRows(form, field, next))}
        />
      </div>
      {!disabled ? (
        <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => add(rows.length - 1)} disabled={rows.length >= MAX_ITEMS}>
          <Plus />{addLabel}
        </Button>
      ) : null}
    </FieldWrapper>
  )
}
