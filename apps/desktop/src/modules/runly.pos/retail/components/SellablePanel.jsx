// apps/desktop/src/modules/runly.pos/retail/components/SellablePanel.jsx
import { useEffect, useRef, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Button, EmptyState, ErrorState, Input, Skeleton, StatusPill, cn } from '@runly/ui'
import { Barcode, ImageOff, Layers, PackageSearch, Plus, Search, X } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../../lib/runly.js'
import { classifyPosError } from '../lib/retailErrors.js'
import { formatMoney, formatQuantity } from '../lib/retailRules.js'
import ScanMatchesDialog from './ScanMatchesDialog.jsx'

const PAGE_SIZE = 30

// C1 sellables of this outlet: search by name/SKU/barcode (debounced), exact
// scan on Enter or from a keyboard-wedge reader, categories and "Cargar
// más". Searching or scanning never charges; an ambiguous code asks.
export default function SellablePanel({ token, outletId, currency, inCart = {}, disabled, onAdd }) {
  const [text, setText] = useState('')
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState(null)
  const [choice, setChoice] = useState(null)
  const [scanning, setScanning] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => { const t = setTimeout(() => setSearch(text.trim()), 250); return () => clearTimeout(t) }, [text])

  const categories = useQuery({
    queryKey: ['pos-retail-categories', outletId, token],
    queryFn: () => runly.commerce.categories({ outletId }, token),
    enabled: Boolean(token && outletId),
    staleTime: 60_000,
  })
  const list = useInfiniteQuery({
    queryKey: ['pos-retail-sellables', outletId, search, categoryId, token],
    queryFn: ({ pageParam }) => runly.commerce.sellables({ outletId, page: pageParam, pageSize: PAGE_SIZE, ...(search ? { search } : {}), ...(categoryId ? { categoryId } : {}) }, token),
    initialPageParam: 1,
    getNextPageParam: (last) => (last?.pagination?.hasMore ? last.pagination.page + 1 : undefined),
    enabled: Boolean(token && outletId),
    staleTime: 15_000,
  })
  const items = list.data?.pages.flatMap((p) => p.data ?? []) ?? []
  const total = list.data?.pages[0]?.pagination?.total ?? 0

  function pick(item) {
    if (disabled) return
    if (item.requiresVariant) { setChoice({ kind: 'variants', item }); return }
    if (!item.available) { toast.error(`${item.name}: ${item.unavailableMessage ?? 'No se puede vender aquí.'}`); return }
    onAdd(item)
  }

  async function scan(code) {
    const value = code.trim()
    if (!value || disabled) return
    setScanning(true)
    try {
      const { matches = [], ambiguous } = (await runly.commerce.scan({ outletId, code: value }, token)).data ?? {}
      const visible = matches.filter((m) => m.unavailableReason !== 'DISABLED')
      if (!visible.length) {
        toast.error(`No se encontró el código ${value}. Prueba buscar por nombre.`)
        return
      }
      setText('')
      if (ambiguous || visible.length > 1) { setChoice({ kind: 'matches', code: value, matches: visible }); return }
      pick(visible[0])
    } catch (error) {
      toast.error(classifyPosError(error).message)
    } finally {
      setScanning(false)
      inputRef.current?.focus()
    }
  }

  // Keyboard-wedge readers type fast and end with Enter; capture them even
  // when the search field is not focused (dialogs keep their own input).
  useEffect(() => {
    let buffer = ''
    let last = 0
    function onKey(event) {
      const target = event.target
      if (target?.closest?.('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return
      const now = Date.now()
      if (now - last > 60) buffer = ''
      last = now
      if (event.key === 'Enter') {
        if (buffer.length >= 4) { event.preventDefault(); scan(buffer) }
        buffer = ''
      } else if (event.key.length === 1) {
        buffer += event.key
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3" aria-label="Productos">
      <form onSubmit={(e) => { e.preventDefault(); scan(text) }} role="search" className="relative">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[hsl(var(--muted-foreground))]" aria-hidden="true" />
        <Input
          ref={inputRef}
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Buscar o escanear (nombre, SKU o código)"
          aria-label="Buscar producto por nombre o SKU, o escanear código de barras y presionar Enter"
          inputMode="search"
          enterKeyHint="search"
          className="h-14 w-full rounded-md border-2 border-[hsl(var(--input))] bg-[hsl(var(--card))] pl-12 pr-24 text-base text-[hsl(var(--foreground))] placeholder:text-[hsl(var(--muted-foreground))] focus-visible:border-(--brand-primary) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]"
        />
        <div className="absolute right-2 top-1/2 flex -translate-y-1/2 items-center gap-1">
          {text && <Button type="button" variant="ghost" size="icon" className="h-11 w-11 sm:h-11 sm:w-11" onClick={() => { setText(''); inputRef.current?.focus() }} aria-label="Borrar búsqueda"><X className="h-5 w-5" aria-hidden="true" /></Button>}
          <Button type="submit" variant="ghost" size="icon" className="h-11 w-11 sm:h-11 sm:w-11" disabled={!text.trim() || scanning} aria-label="Buscar este código exacto"><Barcode className="h-5 w-5" aria-hidden="true" /></Button>
        </div>
      </form>

      <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Categorías">
        {[{ id: null, name: 'Todos' }, ...(categories.data?.data ?? [])].map((c) => (
          <button
            key={c.id ?? 'all'}
            type="button"
            role="tab"
            aria-selected={categoryId === c.id}
            onClick={() => setCategoryId(c.id)}
            className={cn(
              'h-11 shrink-0 whitespace-nowrap rounded-xl border px-4 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
              categoryId === c.id ? 'border-(--brand-primary) bg-(--brand-primary) text-(--brand-primary-foreground)' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] text-[hsl(var(--foreground))] hover:bg-[hsl(var(--muted))]',
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto pb-24 lg:pb-2" aria-busy={list.isFetching}>
        {list.isPending ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-label="Cargando productos">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-2xl" />)}
          </div>
        ) : list.isError ? (
          <ErrorState title="No se pudieron cargar los productos" description={classifyPosError(list.error).message} onRetry={list.refetch} />
        ) : items.length === 0 ? (
          <EmptyState icon={PackageSearch} title={search ? 'Sin resultados' : 'No hay productos a la venta'} description={search ? `Nada coincide con «${search}». Si es un código, presiona Enter para buscarlo exacto.` : 'Agrega productos en Catálogo y habilítalos para esta sucursal.'} />
        ) : (
          <>
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4" aria-label={`${total} productos`}>
              {items.map((item) => (
                <li key={item.id}><SellableCard item={item} currency={currency} quantity={inCart[item.productId] ?? 0} disabled={disabled} onPick={() => pick(item)} /></li>
              ))}
            </ul>
            <div className="mt-3 flex flex-col items-center gap-1 text-sm text-[hsl(var(--muted-foreground))]">
              <span aria-live="polite">{items.length} de {total} productos</span>
              {list.hasNextPage && (
                <Button variant="outline" size="lg" onClick={() => list.fetchNextPage()} loading={list.isFetchingNextPage}>Cargar más</Button>
              )}
            </div>
          </>
        )}
      </div>

      {choice && (
        <ScanMatchesDialog
          choice={choice}
          token={token}
          outletId={outletId}
          currency={currency}
          onClose={() => { setChoice(null); inputRef.current?.focus() }}
          onPick={(item) => { if (item.requiresVariant) { setChoice({ kind: 'variants', item }); return } setChoice(null); onAdd(item); inputRef.current?.focus() }}
        />
      )}
    </section>
  )
}

function SellableCard({ item, currency, quantity, disabled, onPick }) {
  const off = !item.available && !item.requiresVariant
  const low = item.trackStock && item.available && item.stock != null && item.stock > 0 && item.stock <= 5
  return (
    <button
      type="button"
      onClick={onPick}
      disabled={disabled}
      aria-label={`${item.name}, ${item.requiresVariant ? `desde ${formatMoney(item.price, item.currency ?? currency)}, elegir opción` : formatMoney(item.price, item.currency ?? currency)}${quantity ? `, ${formatQuantity(quantity)} en la venta` : ''}${off ? `, no disponible: ${item.unavailableMessage ?? ''}` : ''}`}
      className={cn(
        'group flex h-full w-full flex-col overflow-hidden rounded-2xl border text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2 disabled:cursor-not-allowed',
        off ? 'border-dashed border-[hsl(var(--input))] bg-[hsl(var(--muted))]' : quantity ? 'border-(--brand-primary) bg-[hsl(var(--card))] active:scale-[0.99]' : 'border-[hsl(var(--border))] bg-[hsl(var(--card))] hover:border-(--brand-primary) active:scale-[0.99]',
      )}
    >
      <div className="relative aspect-[4/3] w-full bg-[hsl(var(--muted))]">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[hsl(var(--muted-foreground))]"><ImageOff className="h-6 w-6" aria-hidden="true" /></div>
        )}
        {item.requiresVariant && <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-md bg-[hsl(var(--card))] px-2 py-0.5 text-xs font-semibold text-[hsl(var(--foreground))] shadow-sm"><Layers className="h-3.5 w-3.5" aria-hidden="true" />Opciones</span>}
        {quantity > 0 && <span className="absolute right-2 top-2 inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-(--brand-primary) px-2 text-sm font-bold tabular-nums text-(--brand-primary-foreground) shadow-sm" aria-hidden="true">{formatQuantity(quantity)}</span>}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-3">
        <span className="line-clamp-2 text-sm font-semibold text-[hsl(var(--foreground))]">{item.name}</span>
        <span className="flex items-end justify-between gap-2">
          <span className="text-lg font-bold tabular-nums text-[hsl(var(--foreground))]">
            {item.requiresVariant && item.price ? <span className="text-xs font-medium text-[hsl(var(--muted-foreground))]">Desde </span> : null}
            {item.price ? formatMoney(item.price, item.currency ?? currency) : '—'}
          </span>
          {!off && <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-(--brand-primary) text-(--brand-primary-foreground) transition-transform group-active:scale-90" aria-hidden="true"><Plus className="h-5 w-5" /></span>}
        </span>
        {off && <StatusPill size="sm" tone={item.unavailableReason === 'OUT_OF_STOCK_AT_OUTLET' ? 'danger' : 'neutral'} className="self-start">{item.unavailableReason === 'OUT_OF_STOCK_AT_OUTLET' ? 'Agotado' : 'No disponible'}</StatusPill>}
        {low && <span className="text-xs font-semibold text-amber-900 dark:text-amber-300">Quedan {item.stock}</span>}
      </div>
    </button>
  )
}
