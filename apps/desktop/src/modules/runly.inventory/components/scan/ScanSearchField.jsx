import { forwardRef, useEffect, useId, useMemo, useState } from 'react'
import { Loader2, ScanBarcode, X } from 'lucide-react'
import { Button, Input, Popover, PopoverAnchor, PopoverContent, Skeleton, cn } from '@runly/ui'
import { useCoverUrls, useDebouncedValue, useLabelAssetSearch } from '../../hooks/useLabelStudio.js'
import { decideManualEntry } from '../../lib/scan-kiosk.js'
import { normalizeScanCode } from '../../lib/scan-session.js'
import { AssetMatchContext, AssetThumb } from '../AssetSearchParts.jsx'
import { InventoryAdminStatusBadge } from '../InventoryAdminStatusBadge.jsx'

const SUGGESTIONS = 8
const MIN_SEARCH = 2

// "Buscar o escribir código": live suggestions from the same search as the
// Inventario list (GET /inventory/items?search=, inventory-search-service), and
// Enter on an exact code (folio, serie, n.º de activo, QR link) resolves it like
// a camera read. Keyboard-wedge scanners type + Enter faster than the debounce,
// so their code always goes to the exact lookup (decideManualEntry).
export const ScanSearchField = forwardRef(function ScanSearchField({ value, onChange, onResolve, onPick, autoFocus, blurAfterSubmit, labelAction, onFocusChange }, ref) {
  const id = useId()
  const listId = `${id}-list`
  const [focused, setFocused] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [hint, setHint] = useState(null)
  const term = normalizeScanCode(value)
  const debounced = useDebouncedValue(term, 300)
  const enabled = debounced.length >= MIN_SEARCH
  const query = useLabelAssetSearch({ search: debounced }, { enabled, pageSize: SUGGESTIONS })
  const suggestions = useMemo(() => (enabled ? (query.data?.pages?.[0]?.data ?? []).slice(0, SUGGESTIONS) : []), [enabled, query.data])
  const total = Number(query.data?.pages?.[0]?.total ?? 0)
  const covers = useCoverUrls(suggestions.map((s) => s.coverImageFileId)).data ?? {}
  const ready = enabled && debounced === term && query.isSuccess && !query.isPlaceholderData && !query.isFetching

  useEffect(() => { setActiveIndex(-1); setHint(null) }, [term])

  const open = focused && term.length >= MIN_SEARCH && (suggestions.length > 0 || query.isFetching || ready)

  function finish(event) {
    onChange('')
    setActiveIndex(-1)
    if (blurAfterSubmit) event?.currentTarget?.blur?.()
  }

  function submit(event) {
    const decision = decideManualEntry({ text: value, suggestions, ready, activeIndex })
    if (decision.kind === 'none') return
    if (decision.kind === 'choose') { setHint('Hay varias coincidencias: elige una de la lista.'); setActiveIndex(0); return }
    if (decision.kind === 'pick') onPick(decision.item)
    else onResolve(decision.code)
    finish(event)
  }

  function onKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      submit(event)
    } else if (event.key === 'ArrowDown' && suggestions.length) {
      event.preventDefault()
      setActiveIndex((i) => (i + 1) % suggestions.length)
    } else if (event.key === 'ArrowUp' && suggestions.length) {
      event.preventDefault()
      setActiveIndex((i) => (i <= 0 ? suggestions.length - 1 : i - 1))
    } else if (event.key === 'Escape') {
      if (activeIndex >= 0) setActiveIndex(-1)
      else if (value) onChange('')
      else return
      event.preventDefault()
      event.stopPropagation()
    }
  }

  return (
    <Popover open={open}>
      <div className="flex min-h-11 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <label htmlFor={id} className="text-sm font-medium">Buscar o escribir código</label>
        {labelAction}
      </div>
      <PopoverAnchor asChild>
        <div className="relative mt-1">
          <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 size-5 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
          <Input
            ref={ref}
            id={id}
            role="combobox"
            aria-expanded={open}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={open && activeIndex >= 0 ? `${listId}-${activeIndex}` : undefined}
            aria-describedby={`${id}-hint`}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onFocus={() => { setFocused(true); onFocusChange?.(true) }}
            onBlur={() => { setFocused(false); onFocusChange?.(false) }}
            placeholder="Folio, serie, n.º de activo, nombre, modelo..."
            autoFocus={autoFocus}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="search"
            className="h-12 rounded-md pl-10 pr-20 text-base"
          />
          <div className="absolute right-1.5 top-1/2 flex -translate-y-1/2 items-center gap-1">
            {query.isFetching && enabled ? <Loader2 className="size-4 animate-spin text-[hsl(var(--muted-foreground))] motion-reduce:animate-none" aria-label="Buscando" /> : null}
            {value ? (
              <Button type="button" size="icon" variant="ghost" className="size-9" aria-label="Limpiar" onMouseDown={(e) => e.preventDefault()} onClick={() => onChange('')}>
                <X className="size-4" />
              </Button>
            ) : null}
          </div>
        </div>
      </PopoverAnchor>
      <p id={`${id}-hint`} className={cn('mt-1.5 text-xs', hint ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-[hsl(var(--muted-foreground))]')}>
        {hint ?? 'Enter busca el código exacto; también con lector USB o Bluetooth.'}
      </p>

      <PopoverContent role="presentation" align="start" sideOffset={6}
        onOpenAutoFocus={(e) => e.preventDefault()} onCloseAutoFocus={(e) => e.preventDefault()}
        className="w-(--radix-popover-trigger-width) overflow-hidden rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--card))] p-0 shadow-xl">
        <p className="border-b border-[hsl(var(--border))] px-3 py-2 text-xs text-[hsl(var(--muted-foreground))]" aria-live="polite">
          {query.isFetching && !suggestions.length ? 'Buscando...'
            : suggestions.length ? `${total > suggestions.length ? `${suggestions.length} de ${total}` : suggestions.length} ${total === 1 ? 'coincidencia' : 'coincidencias'} · flechas para elegir, Enter para agregar`
              : `Sin coincidencias. Enter registra «${term}» como código.`}
        </p>
        {query.isFetching && !suggestions.length ? (
          <div className="space-y-2 p-3" aria-hidden="true"><Skeleton className="h-10 w-full rounded-md" /><Skeleton className="h-10 w-full rounded-md" /></div>
        ) : null}
        {suggestions.length ? (
          <ul id={listId} role="listbox" aria-label="Sugerencias" className="max-h-[min(45dvh,22rem)] overflow-y-auto overscroll-contain py-1">
            {suggestions.map((item, index) => {
              const active = index === activeIndex
              const code = item.folio ?? item.assetTag
              return (
                <li key={item.id} id={`${listId}-${index}`} role="option" aria-selected={active}
                  onMouseDown={(e) => e.preventDefault()}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={(e) => { onPick(item); finish(e) }}
                  className={cn('flex min-h-14 cursor-pointer items-center gap-3 px-3 py-2', active ? 'bg-(--brand-soft)' : 'hover:bg-[hsl(var(--muted)/0.6)]')}>
                  <AssetThumb url={covers[item.coverImageFileId]} className="size-10" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{item.name ?? code}</span>
                    <span className="flex min-w-0 flex-wrap gap-x-2 text-xs text-[hsl(var(--muted-foreground))]">
                      {code ? <span className="font-mono text-[hsl(var(--foreground)/0.8)]">{code}</span> : null}
                      {item.serialNumber ? <span className="truncate">S/N {item.serialNumber}</span> : null}
                      {item.locationName ? <span className="truncate">{item.locationName}</span> : null}
                    </span>
                    <AssetMatchContext item={item} search={debounced} />
                  </span>
                  <span className="hidden shrink-0 sm:inline-flex"><InventoryAdminStatusBadge status={item.adminStatus} /></span>
                </li>
              )
            })}
          </ul>
        ) : null}
      </PopoverContent>
    </Popover>
  )
})
