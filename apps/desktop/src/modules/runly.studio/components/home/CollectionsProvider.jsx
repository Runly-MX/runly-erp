import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { runly } from '../../../../lib/runly.js'
import { CollectionPickerDialog } from './CollectionPickerDialog.jsx'

const unwrap = response => response?.data ?? response
const Context = createContext(null)
export const useCollections = () => useContext(Context)

// The item a card represents. Runly's built-in templates have no row, only a key.
export const itemRef = (kind, source) => kind === 'design' ? { kind, itemId: source.id } : source.scope === 'runly' ? { kind: 'builtin', itemId: source.key } : { kind: 'template', itemId: source.id }

// Personal collections and favorites for the Studio home: one query each, mutations that refresh the
// lists they affect, and the "add to collection" dialog shared by every card.
export function CollectionsProvider({ token, scopeKey, children }) {
  const queryClient = useQueryClient()
  const [picking, setPicking] = useState(null)
  const base = useMemo(() => ['studio', ...scopeKey], [scopeKey])
  const collections = useQuery({ queryKey: [...base, 'collections'], enabled: Boolean(token), staleTime: 30_000, retry: false, queryFn: async ({ signal }) => unwrap(await runly.studio.collections(token, signal)) })
  const favorites = useQuery({ queryKey: [...base, 'favorites'], enabled: Boolean(token), staleTime: 30_000, retry: false, queryFn: async ({ signal }) => unwrap(await runly.studio.favorites(token, signal)) })
  const sets = useMemo(() => ({ design: new Set(favorites.data?.designs), template: new Set(favorites.data?.templates), builtin: new Set(favorites.data?.builtins) }), [favorites.data])
  const refresh = useCallback(() => Promise.all(['collections', 'favorites', 'designs', 'templates'].map(key => queryClient.invalidateQueries({ queryKey: [...base, key] }))), [queryClient, base])
  const fail = error => toast.error(error?.message ?? 'No se pudo completar la acción.')

  const value = useMemo(() => ({
    collections: collections.data ?? [],
    isFavorite: ({ kind, itemId }) => sets[kind]?.has(itemId) ?? false,
    async toggleFavorite(ref) {
      try { await (sets[ref.kind]?.has(ref.itemId) ? runly.studio.unfavorite(ref, token) : runly.studio.favorite(ref, token)); await refresh() } catch (error) { fail(error) }
    },
    pick: ref => setPicking(ref),
    async create(name) { const row = unwrap(await runly.studio.createCollection({ name }, token)); await refresh(); return row },
    async rename(id, name) { await runly.studio.renameCollection(id, { name }, token); await refresh() },
    async remove(id) { await runly.studio.deleteCollection(id, token); await refresh() },
    async add(id, ref) { await runly.studio.addToCollection(id, ref, token); await refresh() },
    async removeItem(id, ref) { try { await runly.studio.removeFromCollection(id, ref, token); await refresh(); toast.success('Se quitó de la colección.') } catch (error) { fail(error) } },
  }), [collections.data, sets, token, refresh])

  return (
    <Context.Provider value={value}>
      {children}
      <CollectionPickerDialog item={picking} onClose={() => setPicking(null)} />
    </Context.Provider>
  )
}
