import { useEffect, useMemo, useState } from 'react'
import {
  Button, Checkbox, EmptyState, ErrorState, LoadingState, SearchInput, SelectField, Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle, cn,
} from '@runly/ui'
import { Loader2, PackageSearch } from 'lucide-react'
import { toast } from 'sonner'
import { useInventoryCustomFieldItems, useSetInventoryCustomFieldItems } from '../../hooks/useInventoryCatalogs.js'
import { useDebouncedValue, useFetchAllFiltered, useLabelAssetSearch } from '../../hooks/useLabelStudio.js'
import { typeOptions } from '../InventoryCatalogPickers.jsx'

const ALL = 'all'
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`

// Catálogos > Campos > Activos: the items that carry a field, edited in bulk.
// Checking an item adds the field to its form (empty); unchecking removes it and its value.
export function CustomFieldItemsSheet({ field, types, onOpenChange }) {
  const open = Boolean(field)
  const attached = useInventoryCustomFieldItems(field?.id)
  const save = useSetInventoryCustomFieldItems()
  const [checked, setChecked] = useState(null)
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState(ALL)
  const [selectingAll, setSelectingAll] = useState(false)
  const debounced = useDebouncedValue(search, 300)
  const filters = { search: debounced, labeled: ALL, categoryId: categoryId === ALL ? '' : categoryId }
  const query = useLabelAssetSearch(filters, { enabled: open })
  const fetchAll = useFetchAllFiltered()

  useEffect(() => { if (!open) { setChecked(null); setSearch(''); setCategoryId(ALL) } }, [open])
  useEffect(() => { if (open && attached.data && !checked) setChecked(new Set(attached.data)) }, [open, attached.data, checked])

  const items = useMemo(() => (query.data?.pages ?? []).flatMap((page) => page?.data ?? []), [query.data])
  const total = Number(query.data?.pages?.[0]?.total ?? 0)
  const original = useMemo(() => new Set(attached.data ?? []), [attached.data])
  const current = checked ?? original
  const add = [...current].filter((id) => !original.has(id))
  const remove = [...original].filter((id) => !current.has(id))
  const typeOpts = useMemo(() => [{ value: ALL, label: 'Todos los tipos' }, ...typeOptions(types)], [types])

  const toggle = (id, on) => setChecked((prev) => {
    const next = new Set(prev ?? original)
    if (on) next.add(id); else next.delete(id)
    return next
  })
  async function setAllFiltered(on) {
    setSelectingAll(true)
    try {
      const rows = total <= items.length ? items : await fetchAll(filters)
      setChecked((prev) => {
        const next = new Set(prev ?? original)
        for (const row of rows) { if (on) next.add(row.id); else next.delete(row.id) }
        return next
      })
    } catch (err) {
      toast.error(err?.message ?? 'No se pudieron seleccionar los resultados')
    } finally {
      setSelectingAll(false)
    }
  }
  async function submit() {
    try {
      const res = await save.mutateAsync({ id: field.id, add, remove })
      const { added = 0, removed = 0 } = res?.data ?? {}
      toast.success(`«${field.label}»: ${plural(added, 'activo agregado', 'activos agregados')}, ${plural(removed, 'quitado', 'quitados')}`)
      onOpenChange(false)
    } catch (err) {
      toast.error(err?.message ?? 'No se pudo actualizar')
    }
  }

  const allVisibleChecked = items.length > 0 && items.every((item) => current.has(item.id))
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-lg">
        <SheetHeader className="shrink-0 border-b border-[hsl(var(--border))] px-5 py-4">
          <SheetTitle>Activos con «{field?.label}»</SheetTitle>
          <SheetDescription>Marca los activos que deben llevar este campo. Al quitarlo de un activo se borra su valor.</SheetDescription>
        </SheetHeader>
        <div className="shrink-0 space-y-2 border-b border-[hsl(var(--border))] px-5 py-3">
          <SearchInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Nombre, folio, serie, modelo..." aria-label="Buscar activos" autoComplete="off" />
          <SelectField aria-label="Tipo" options={typeOpts} value={categoryId} onValueChange={(v) => setCategoryId(v || ALL)} />
          <label className="flex min-h-10 cursor-pointer items-center gap-2.5 text-sm">
            <Checkbox className="size-5" disabled={!items.length || selectingAll} checked={allVisibleChecked}
              onCheckedChange={(v) => setAllFiltered(Boolean(v))} aria-label="Marcar todos los resultados" />
            <span className="text-[hsl(var(--muted-foreground))]">
              {allVisibleChecked ? 'Desmarcar' : 'Marcar'} {total > items.length ? `los ${total}` : 'todos'} · {plural(total, 'resultado', 'resultados')}
            </span>
            {selectingAll || (query.isFetching && !query.isFetchingNextPage) ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-label="Cargando" /> : null}
          </label>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {attached.isLoading || query.isLoading ? <LoadingState /> : null}
          {query.isError ? <div className="p-4"><ErrorState title="No se pudo buscar" description={query.error?.message} onRetry={() => query.refetch()} /></div> : null}
          {!query.isLoading && !query.isError && !items.length ? (
            <div className="p-4"><EmptyState icon={PackageSearch} title="Sin activos" description="Prueba con otra búsqueda o tipo." /></div>
          ) : null}
          {items.length && !attached.isLoading ? (
            <ul className="divide-y divide-[hsl(var(--border)/0.6)]">
              {items.map((item) => {
                const on = current.has(item.id)
                return (
                  <li key={item.id} className={cn('transition-colors', on ? 'bg-(--brand-soft)' : 'hover:bg-[hsl(var(--muted)/0.5)]')}>
                    <label className="flex min-h-14 cursor-pointer items-center gap-3 px-5 py-2">
                      <Checkbox className="size-5" checked={on} onCheckedChange={(v) => toggle(item.id, Boolean(v))} aria-label={`Campo en ${item.name ?? item.folio}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{item.name ?? item.folio ?? 'Equipo'}</span>
                        <span className="flex min-w-0 flex-wrap gap-x-2 text-xs text-[hsl(var(--muted-foreground))]">
                          {item.folio ? <span className="font-mono">{item.folio}</span> : null}
                          {item.categoryName ? <span className="truncate">{item.categoryName}</span> : null}
                          {item.serialNumber ? <span className="truncate">S/N {item.serialNumber}</span> : null}
                        </span>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          ) : null}
          {query.hasNextPage ? (
            <div className="flex justify-center p-4">
              <Button type="button" variant="outline" onClick={() => query.fetchNextPage()} disabled={query.isFetchingNextPage}>
                {query.isFetchingNextPage ? 'Cargando...' : `Cargar más (${items.length} de ${total})`}
              </Button>
            </div>
          ) : null}
        </div>
        <SheetFooter className="shrink-0 items-center border-t border-[hsl(var(--border))] px-5 py-4">
          <span className="mr-auto text-xs text-[hsl(var(--muted-foreground))]">
            {plural(current.size, 'activo', 'activos')}{add.length || remove.length ? ` · +${add.length} / -${remove.length}` : ''}
          </span>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={save.isPending}>Cancelar</Button>
          <Button type="button" onClick={submit} disabled={save.isPending || (!add.length && !remove.length)}>{save.isPending ? 'Guardando...' : 'Guardar'}</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
