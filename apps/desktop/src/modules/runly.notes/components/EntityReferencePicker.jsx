import { useEffect, useState } from 'react'
import { Link2, ShieldOff, SearchX } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
  EmptyState, ErrorState, SearchInput, SelectField, Skeleton,
} from '@runly/ui'
import { REFERENCE_TYPES, referenceTypeOf } from '../lib/entityReferenceTypes.js'
import { useReferenceSearch } from '../hooks/useRelationTargets.js'

const TYPE_OPTIONS = REFERENCE_TYPES.map(({ value, label }) => ({ value, label }))

function useDebounced(value, delay) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(timer)
  }, [value, delay])
  return debounced
}

// Picks a record to link from a note. Search/permission/visibility are handled
// by the /relation-targets API; a 403 means the user cannot see that type.
export function EntityReferencePicker({ open, onOpenChange, onPick }) {
  const [entityType, setEntityType] = useState(REFERENCE_TYPES[0].value)
  const [query, setQuery] = useState('')
  const debounced = useDebounced(query.trim(), 250)
  const search = useReferenceSearch(open ? entityType : null, debounced)
  const type = referenceTypeOf(entityType)
  const TypeIcon = type?.Icon ?? Link2
  const rows = search.data ?? []

  function handleOpenChange(next) {
    if (!next) setQuery('')
    onOpenChange(next)
  }

  function pick(row) {
    onPick({ entityType, recordId: row.id })
    handleOpenChange(false)
  }

  let results
  if (search.isLoading) {
    results = (
      <div className="space-y-2 p-3" aria-busy="true">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-11 w-full rounded-md" />)}
      </div>
    )
  } else if (search.isError && search.error?.status === 403) {
    results = <EmptyState icon={ShieldOff} title="Sin permiso para ver este tipo de registro" description="Pide acceso al administrador o elige otro tipo." />
  } else if (search.isError) {
    results = <ErrorState title="No se pudo buscar" description="Intenta de nuevo en unos segundos." onRetry={() => search.refetch()} showReport={false} className="m-3 py-8" />
  } else if (!rows.length) {
    results = <EmptyState icon={SearchX} title="Sin resultados" description={debounced ? `No hay registros para "${debounced}".` : 'No hay registros de este tipo.'} />
  } else {
    results = (
      <ul className="divide-y divide-border">
        {rows.map((row) => (
          <li key={row.id}>
            <button
              type="button"
              onClick={() => pick(row)}
              className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            >
              <TypeIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-foreground">{row.title}</span>
                {row.subtitle ? <span className="block truncate text-xs text-muted-foreground">{row.subtitle}</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent scrollable size="md" className="gap-0 p-0 md:p-0 md:pt-0!">
        <DialogHeader icon={Link2} className="mb-0 shrink-0 px-5 pt-4 pb-3">
          <DialogTitle>Vincular registro</DialogTitle>
          <DialogDescription>Inserta un enlace vivo a un registro de Runly dentro de la nota.</DialogDescription>
        </DialogHeader>
        <div className="shrink-0 space-y-3 px-5 pb-3">
          <SelectField
            label="Tipo de registro"
            value={entityType}
            onValueChange={(value) => { setEntityType(value); setQuery('') }}
            options={TYPE_OPTIONS}
          />
          <SearchInput
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={`Buscar ${type?.label?.toLowerCase() ?? 'registro'}...`}
            aria-label="Buscar registro"
          />
        </div>
        <div className="min-h-48 flex-1 overflow-y-auto overscroll-contain border-t border-border">{results}</div>
      </DialogContent>
    </Dialog>
  )
}
