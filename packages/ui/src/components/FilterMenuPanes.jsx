import { useMemo, useState } from 'react'
import { Check, Search } from 'lucide-react'
import { DateRangePanel } from './DateRangePanel.jsx'
import { Switch } from './Switch.jsx'
import { filterType } from './filter-menu-helpers.js'
import { cn } from '../lib/utils.js'

const norm = (text) => String(text ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

const ROW = 'flex min-h-10 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors md:min-h-9'

function OptionRow({ selected, onClick, children, multi }) {
  return (
    <button
      type="button"
      role={multi ? 'checkbox' : 'option'}
      aria-checked={multi ? selected : undefined}
      aria-selected={multi ? undefined : selected}
      onClick={onClick}
      className={cn(ROW, selected ? 'bg-(--brand-soft) font-medium text-[hsl(var(--foreground))]' : 'text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]')}
    >
      {multi ? (
        <span className={cn('flex h-4 w-4 shrink-0 items-center justify-center rounded border', selected ? 'border-(--brand-primary) bg-(--brand-primary) text-(--brand-primary-foreground)' : 'border-[hsl(var(--border))]')}>
          {selected ? <Check className="h-3 w-3" aria-hidden="true" /> : null}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{children}</span>
      {!multi && selected ? <Check className="h-4 w-4 shrink-0 text-(--brand-primary)" aria-hidden="true" /> : null}
    </button>
  )
}

// Options list for select / combobox / multiselect filters.
function OptionList({ filter, value, onChange }) {
  const type = filterType(filter)
  const options = filter.options ?? []
  const multi = type === 'multiselect'
  const searchable = type === 'combobox' || options.length > 8
  const [query, setQuery] = useState('')
  const visible = useMemo(() => (query ? options.filter((o) => norm(o.label).includes(norm(query))) : options), [options, query])
  const picked = multi ? (Array.isArray(value[filter.key]) ? value[filter.key].map(String) : []) : []
  const current = multi ? '' : String(value[filter.key] ?? '')

  const toggle = (optionValue) => {
    const key = String(optionValue)
    onChange({ [filter.key]: picked.includes(key) ? picked.filter((v) => v !== key) : [...picked, key] })
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      {searchable ? (
        <div className="relative shrink-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          <input
            type="text"
            data-no-enter-submit=""
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={filter.searchPlaceholder ?? 'Buscar…'}
            aria-label={`Buscar en ${filter.label}`}
            className="glass-subtle h-10 w-full rounded-xl border border-[hsl(var(--input))] pl-9 pr-3 text-base text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] md:h-9 md:text-sm"
          />
        </div>
      ) : null}
      <div role={multi ? 'group' : 'listbox'} aria-label={filter.label} className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {multi ? (
          <div className="flex items-center justify-between px-3 pb-1 text-xs text-[hsl(var(--muted-foreground))]">
            <span>{picked.length ? `${picked.length} seleccionados` : 'Elige una o más'}</span>
            <button type="button" disabled={!picked.length} onClick={() => onChange({ [filter.key]: [] })} className="font-medium transition-colors hover:text-[hsl(var(--foreground))] disabled:opacity-40">
              Limpiar
            </button>
          </div>
        ) : (
          <OptionRow selected={current === ''} onClick={() => onChange({ [filter.key]: '' })}>{filter.allLabel ?? 'Todos'}</OptionRow>
        )}
        {visible.map((option) => (
          multi ? (
            <OptionRow key={option.value} multi selected={picked.includes(String(option.value))} onClick={() => toggle(option.value)}>{option.label}</OptionRow>
          ) : (
            <OptionRow key={option.value} selected={current === String(option.value)} onClick={() => onChange({ [filter.key]: option.value })}>{option.label}</OptionRow>
          )
        ))}
        {visible.length === 0 ? <p className="px-3 py-6 text-center text-sm text-[hsl(var(--muted-foreground))]">Sin resultados</p> : null}
      </div>
    </div>
  )
}

// Right pane (desktop) / second step (mobile) of the FilterMenu: the controls
// for ONE filter. `onChange(patch)` receives a partial value object.
export function FilterOptionsPane({ filter, value, onChange }) {
  const type = filterType(filter)
  if (type === 'daterange') {
    return (
      <DateRangePanel
        layout="stacked"
        from={value[filter.fromKey] || ''}
        to={value[filter.toKey] || ''}
        onChange={(from, to) => onChange({ [filter.fromKey]: from || '', [filter.toKey]: to || '' })}
      />
    )
  }
  if (type === 'toggle') {
    const checked = value[filter.key] === true
    return (
      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm hover:bg-[hsl(var(--muted))]">
        <span className="min-w-0">
          <span className="block font-medium">{filter.toggleLabel ?? filter.label}</span>
          {filter.description ? <span className="block text-xs text-[hsl(var(--muted-foreground))]">{filter.description}</span> : null}
        </span>
        <Switch checked={checked} onCheckedChange={(next) => onChange({ [filter.key]: Boolean(next) })} aria-label={filter.label} />
      </label>
    )
  }
  return <OptionList key={filter.key} filter={filter} value={value} onChange={onChange} />
}
