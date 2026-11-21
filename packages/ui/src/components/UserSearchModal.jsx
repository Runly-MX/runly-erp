// packages/ui/src/components/UserSearchModal.jsx
import { useEffect, useRef, useState } from 'react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from './Dialog.jsx'
import { Button } from './Button.jsx'
import { SelectField } from './FormFields.jsx'
import { SearchInput } from './SearchInput.jsx'
import { Skeleton } from './Skeleton.jsx'
import { Check, Loader2, UserRoundSearch } from 'lucide-react'
import { PersonAvatar } from './PersonAvatar.jsx'
import { buildApiHeaders } from '../lib/apiHeaders.js'
import { cn } from '../lib/utils.js'

const PAGE = 20
const DEBOUNCE_MS = 300
const CACHE_TTL_MS = 30_000
// Recent listings per company + caller + term, so reopening the picker or going
// back to a previous term paints instantly. Keyed by company and caller: one
// company's directory is never shown in another.
const cache = new Map()

export function searchTermOf(query) {
  const q = query.trim()
  return q.length >= 2 ? q : ''
}

// Company members picker. One request per (term, page): the term is debounced,
// every request is aborted when superseded or when the dialog closes, and the
// fetch depends only on primitives, so a parent passing new array props on each
// render (excludeIds, roles) never triggers a new request.
export function UserSearchModal({
  open, onClose, onConfirm, roles = null, excludeIds = null, apiBase, token, companyId = null,
  includeSelf = false, title = 'Buscar usuario', description = 'Personas de esta empresa.', confirmLabel = 'Confirmar',
}) {
  const [query, setQuery] = useState('')
  const [term, setTerm] = useState('')
  const [list, setList] = useState({ rows: [], hasMore: false, status: 'idle', term: '' })
  const [loadingMore, setLoadingMore] = useState(false)
  const [reload, setReload] = useState(0)
  const [selected, setSelected] = useState(null)
  const roleOptions = roles ?? []
  const [role, setRole] = useState(() => roleOptions[0]?.value ?? '')
  const [active, setActive] = useState(0)
  const moreRef = useRef(null)
  const listRef = useRef(null)
  const cacheKey = `${apiBase}|${companyId}|${String(token ?? '').slice(-16)}|${includeSelf ? 1 : 0}|${term}`

  // Reset on close (not on open): the next opening then starts with the default
  // listing in a single request instead of first replaying the last term.
  useEffect(() => {
    if (open) return
    moreRef.current?.abort()
    setQuery(''); setTerm(''); setSelected(null); setActive(0); setLoadingMore(false)
    setList({ rows: [], hasMore: false, status: 'idle', term: '' })
    setRole(roleOptions[0]?.value ?? '')
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps -- once per closing

  // Debounce typing; clearing the box goes back to the default listing at once.
  useEffect(() => {
    if (!open) return
    const next = searchTermOf(query)
    if (next === term) return
    const timer = setTimeout(() => setTerm(next), next ? DEBOUNCE_MS : 0)
    return () => clearTimeout(timer)
  }, [open, query, term])

  useEffect(() => {
    if (!open || !apiBase) return
    moreRef.current?.abort()
    setLoadingMore(false)
    const hit = cache.get(cacheKey)
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      setList({ rows: hit.rows, hasMore: hit.hasMore, status: 'ready', term })
      setActive(0)
      return
    }
    const controller = new AbortController()
    // Keep the previous rows on screen while the new term loads: no flicker.
    setList((current) => ({ ...current, status: 'loading' }))
    fetchPage({ apiBase, token, companyId, term, includeSelf, offset: 0, signal: controller.signal })
      .then(({ rows, hasMore }) => {
        cache.set(cacheKey, { at: Date.now(), rows, hasMore })
        setList({ rows, hasMore, status: 'ready', term })
        setActive(0)
      })
      .catch((error) => {
        if (controller.signal.aborted) return
        setList((current) => ({ ...current, status: error?.status === 403 ? 'forbidden' : 'error', term }))
      })
    return () => controller.abort()
  }, [open, cacheKey, reload]) // eslint-disable-line react-hooks/exhaustive-deps -- cacheKey carries every input

  useEffect(() => () => moreRef.current?.abort(), [])

  function loadMore() {
    if (loadingMore || !list.hasMore) return
    const controller = new AbortController()
    moreRef.current = controller
    setLoadingMore(true)
    fetchPage({ apiBase, token, companyId, term, includeSelf, offset: list.rows.length, signal: controller.signal })
      .then(({ rows, hasMore }) => {
        const seen = new Set(list.rows.map((u) => u.id))
        const merged = [...list.rows, ...rows.filter((u) => !seen.has(u.id))]
        cache.set(cacheKey, { at: Date.now(), rows: merged, hasMore })
        setList({ rows: merged, hasMore, status: 'ready', term })
      })
      .catch(() => { if (!controller.signal.aborted) setList((current) => ({ ...current, hasMore: true })) })
      .finally(() => { if (!controller.signal.aborted) setLoadingMore(false) })
  }

  const excluded = new Set(excludeIds ?? [])
  const visible = list.rows.filter((u) => !excluded.has(u.id))
  const firstLoad = list.status === 'loading' && list.rows.length === 0
  const refreshing = list.status === 'loading' && list.rows.length > 0
  const needsRole = roleOptions.length > 0
  const canConfirm = Boolean(selected) && (!needsRole || Boolean(role))

  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView?.({ block: 'nearest' })
  }, [active])

  function handleConfirm() {
    if (!canConfirm) return
    onConfirm?.(selected.id, needsRole ? role : null, selected)
    onClose?.()
  }

  function onKeyDown(event) {
    if (!visible.length) return
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(i + 1, visible.length - 1)) }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(i - 1, 0)) }
    else if (event.key === 'Enter') {
      event.preventDefault()
      const user = visible[active]
      if (!user) return
      if (selected?.id === user.id && !needsRole) handleConfirm()
      else setSelected(user)
    }
  }

  const listboxId = 'user-search-results'
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose?.() }}>
      <DialogContent scrollable size="md" className="gap-0 p-0 md:p-0 md:pt-0!" submitOnEnter={false}>
        <DialogHeader icon={UserRoundSearch} className="mb-0 shrink-0 px-5 pt-4 pb-3">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="shrink-0 px-5 pb-3">
          <SearchInput
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onClear={() => setQuery('')}
            onKeyDown={onKeyDown}
            placeholder="Nombre o correo electrónico..."
            aria-label="Buscar por nombre o correo"
            role="combobox"
            aria-expanded="true"
            aria-controls={listboxId}
            aria-activedescendant={visible[active] ? `user-option-${visible[active].id}` : undefined}
            autoFocus
            autoComplete="off"
          />
          <p className="mt-1.5 h-4 text-xs text-[hsl(var(--muted-foreground))]" aria-live="polite">
            {refreshing ? 'Buscando…' : query.trim().length === 1 ? 'Escribe al menos 2 letras para buscar.' : ''}
          </p>
        </div>

        <div ref={listRef} className="min-h-[14rem] flex-1 overflow-y-auto border-y border-[hsl(var(--border))] md:max-h-80">
          {firstLoad ? (
            <div className="space-y-1 p-3" aria-busy="true">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-11 w-full" />)}
            </div>
          ) : list.status === 'error' || list.status === 'forbidden' ? (
            <div className="flex flex-col items-center gap-3 px-5 py-10 text-center">
              <p className="text-sm text-[hsl(var(--muted-foreground))]">
                {list.status === 'forbidden' ? 'No tienes permiso para buscar usuarios de esta empresa.' : 'No se pudo cargar la lista de usuarios.'}
              </p>
              {list.status === 'error' ? <Button type="button" variant="outline" size="sm" onClick={() => setReload((n) => n + 1)}>Reintentar</Button> : null}
            </div>
          ) : visible.length === 0 && list.status === 'ready' && !list.hasMore ? (
            <p className="px-5 py-10 text-center text-sm text-[hsl(var(--muted-foreground))]">
              {list.term ? `Sin resultados para «${list.term}».` : list.rows.length ? 'Todas estas personas ya están agregadas.' : 'No hay otros usuarios en esta empresa.'}
            </p>
          ) : (
            <ul id={listboxId} role="listbox" aria-label="Usuarios" className={cn('p-1.5', refreshing && 'opacity-60')}>
              {visible.map((user, index) => {
                const isSelected = selected?.id === user.id
                return (
                  <li
                    key={user.id}
                    id={`user-option-${user.id}`}
                    data-index={index}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => { setSelected(user); setActive(index) }}
                    onMouseEnter={() => setActive(index)}
                    className={cn(
                      'flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-3 py-2 transition-colors motion-reduce:transition-none',
                      isSelected ? 'bg-[hsl(var(--primary)/0.12)]' : index === active ? 'bg-[hsl(var(--muted)/0.6)]' : '',
                    )}
                  >
                    <PersonAvatar name={user.display_name} src={user.avatarUrl} size="sm" className="shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{user.display_name}</div>
                      <div className="truncate text-xs text-[hsl(var(--muted-foreground))]">{user.email}</div>
                    </div>
                    {isSelected ? <Check className="h-4 w-4 shrink-0 text-[hsl(var(--primary))]" aria-hidden="true" /> : null}
                  </li>
                )
              })}
              {list.hasMore ? (
                <li className="px-1.5 pt-1">
                  <Button type="button" variant="ghost" size="sm" className="w-full" onClick={loadMore} disabled={loadingMore}>
                    {loadingMore ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : null}
                    {loadingMore ? 'Cargando…' : 'Cargar más'}
                  </Button>
                </li>
              ) : null}
            </ul>
          )}
        </div>

        {selected && needsRole ? (
          <div className="shrink-0 px-5 pt-3">
            <SelectField label="Rol" id="user-search-role" value={role} onValueChange={setRole} options={roleOptions.map((r) => ({ value: r.value, label: r.label }))} />
          </div>
        ) : null}

        <DialogFooter className="mt-0 shrink-0 items-center px-5 py-3 sm:justify-between">
          <p className="truncate text-xs text-[hsl(var(--muted-foreground))]" aria-live="polite">
            {selected ? `Seleccionado: ${selected.display_name}` : 'Elige una persona para continuar.'}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" type="button" onClick={() => onClose?.()}>Cancelar</Button>
            <Button variant="primary" type="button" onClick={handleConfirm} disabled={!canConfirm}>{confirmLabel}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

async function fetchPage({ apiBase, token, companyId, term, includeSelf, offset, signal }) {
  const params = new URLSearchParams({ limit: String(PAGE) })
  if (term) params.set('q', term)
  if (offset) params.set('offset', String(offset))
  if (includeSelf) params.set('includeSelf', '1')
  const res = await fetch(`${apiBase}/users/search?${params.toString()}`, { headers: buildApiHeaders(token, companyId), signal })
  if (!res.ok) throw Object.assign(new Error('search failed'), { status: res.status })
  const json = await res.json()
  return { rows: json.data ?? [], hasMore: Boolean(json.hasMore) }
}
