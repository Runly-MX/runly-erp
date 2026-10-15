import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useInfiniteQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ErrorState, MediaGallery, PageHeader, SearchInput } from '@runly/ui'
import { useAuth } from '../../../auth/AuthProvider'
import { runly } from '../../../lib/runly'

const PAGE_SIZE = 120
const ZIP_CHUNK = 50 // the files API accepts up to 50 files per ZIP
const GROUPINGS = [{ key: 'group', label: 'Por inventario' }]

export default function InventoryMediaScreen() {
  const { session } = useAuth()
  const navigate = useNavigate()
  const token = session?.access_token
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [kind, setKind] = useState('all')

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  const query = useInfiniteQuery({
    queryKey: ['inventory', 'media', debounced, kind],
    queryFn: ({ pageParam }) => runly.inventory.listMedia({ page: pageParam, pageSize: PAGE_SIZE, search: debounced || undefined, kind: kind === 'all' ? undefined : kind }, token),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.pagination.page * last.pagination.pageSize < last.pagination.total ? last.pagination.page + 1 : undefined),
    enabled: Boolean(token),
    staleTime: 2 * 60 * 1000,
  })

  const items = useMemo(() => (query.data?.pages ?? []).flatMap((page) => page.data).map((row) => ({
    id: row.id,
    fileAssetId: row.fileAssetId,
    name: row.name,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    date: row.createdAt,
    groupId: row.itemId,
    groupLabel: [row.assetTag, row.itemName].filter(Boolean).join(' · '),
  })), [query.data])

  const resolveSignedUrl = useCallback(async (fileAssetId, variant) => {
    if (!fileAssetId || !token) return null
    try {
      const response = await runly.files.getSignedUrl(fileAssetId, token, variant ? { variant } : {})
      return response?.data?.signedUrl ?? null
    } catch {
      return null
    }
  }, [token])

  // Thumbnails are looked up in batches of up to 50 (the files API limit).
  const resolveSignedUrls = useCallback(async (ids, variant) => {
    if (!token) return {}
    try {
      const response = await runly.files.batchSignedUrls(ids, token, { variant })
      return response?.data ?? {}
    } catch {
      return {}
    }
  }, [token])

  async function download(list) {
    const ids = [...new Set(list.map((item) => item.fileAssetId))]
    const chunks = Array.from({ length: Math.ceil(ids.length / ZIP_CHUNK) }, (_, i) => ids.slice(i * ZIP_CHUNK, (i + 1) * ZIP_CHUNK))
    const toastId = toast.loading(chunks.length > 1 ? `Preparando ${chunks.length} archivos ZIP...` : 'Preparando descarga...')
    try {
      for (const fileIds of chunks) {
        const response = await runly.files.bulkDownload({ fileIds, mode: 'zip' }, token)
        const url = response?.data?.signedUrl
        if (!url) throw new Error('No se pudo preparar la descarga.')
        const link = document.createElement('a')
        link.href = url
        link.rel = 'noopener'
        document.body.appendChild(link)
        link.click()
        link.remove()
      }
      toast.success(chunks.length > 1 ? `${chunks.length} ZIP descargados (hasta ${ZIP_CHUNK} archivos cada uno).` : 'Descarga lista.', { id: toastId })
    } catch (error) {
      toast.error(error?.message ?? 'No se pudo preparar la descarga.', { id: toastId })
    }
  }

  return (
    <div className="min-h-dvh space-y-6 p-4 md:p-6">
      <PageHeader eyebrow="Inventario" title="Multimedia" description="Fotos y documentos de todos los activos en una sola vista." />
      {query.isError ? (
        <ErrorState title="No se pudo cargar la galería" description={query.error?.message} onRetry={() => query.refetch()} />
      ) : (
        <MediaGallery
          items={items}
          loading={query.isLoading}
          hasMore={Boolean(query.hasNextPage)}
          loadingMore={query.isFetchingNextPage}
          onLoadMore={() => query.fetchNextPage()}
          resolveSignedUrl={resolveSignedUrl}
          resolveSignedUrls={resolveSignedUrls}
          onDownload={download}
          groupings={GROUPINGS}
          onOpenGroup={(item) => navigate(`/app/m/runly.inventory/inventory/${item.groupId}`)}
          openGroupLabel="Ver activo"
          storageKey="inventory"
          onKindChange={setKind}
          emptyDescription="Aquí aparecen las fotos y documentos que adjuntes a los activos."
          toolbarStart={<SearchInput value={search} onChange={(e) => setSearch(e.target.value)} onClear={() => setSearch('')} placeholder="Buscar por archivo, activo o número..." className="w-full sm:w-72" />}
        />
      )}
    </div>
  )
}
