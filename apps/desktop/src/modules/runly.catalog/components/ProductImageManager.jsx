// apps/desktop/src/modules/runly.catalog/components/ProductImageManager.jsx
import { useEffect, useState } from 'react'
import { DistDropZone, SortableList, cn } from '@runly/ui'
import { GripVertical, ImageOff, Loader2, Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'

/**
 * One ordered gallery. The first image is the cover (stored as
 * cover_asset_id); the rest keep their order in `images`. The star moves an
 * image to the front, and tiles can be dragged with pointer, touch or keyboard.
 *
 * Props: token, coverId, imageIds, onChange({ coverId, imageIds }), disabled
 */
export default function ProductImageManager({ token, coverId, imageIds = [], onChange, disabled = false }) {
  const [signedUrls, setSignedUrls] = useState({})
  const [uploading, setUploading] = useState(0)
  const ordered = [...new Set([coverId, ...imageIds].filter(Boolean))]
  const idsKey = ordered.join(',')

  useEffect(() => {
    const missing = ordered.filter((id) => !signedUrls[id])
    if (!missing.length || !token) return
    runly.files.batchSignedUrls(missing, token)
      .then((res) => {
        const map = {}
        const items = res?.data ?? res?.urls ?? []
        if (Array.isArray(items)) items.forEach((item) => { if (item?.fileId && item?.url) map[item.fileId] = item.url })
        else if (items && typeof items === 'object') Object.assign(map, items)
        setSignedUrls((prev) => ({ ...prev, ...map }))
      })
      .catch(() => null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, token])

  function emit(next) {
    onChange({ coverId: next[0] ?? null, imageIds: next.slice(1) })
  }

  async function upload(file) {
    const form = new FormData()
    form.append('file', file)
    // Storefront images: PUBLIC bucket with permanent URLs, owned by the
    // catalog module instead of the uploader's private Files.
    form.append('visibility', 'PUBLIC')
    form.append('moduleKey', 'runly.catalog')
    const res = await runly.files.upload(form, token)
    return res?.data ?? res
  }

  async function handleFiles(files) {
    const list = Array.from(files ?? []).filter(Boolean)
    if (!list.length) return
    setUploading(list.length)
    const added = []
    let failed = 0
    for (const file of list) {
      try {
        const asset = await upload(file)
        if (asset?.id) { added.push(asset.id); if (asset.url) setSignedUrls((prev) => ({ ...prev, [asset.id]: asset.url })) }
      } catch {
        failed += 1
      }
      setUploading((n) => Math.max(0, n - 1))
    }
    if (added.length) emit([...ordered, ...added])
    if (failed) toast.error(`${failed} imagen(es) no se pudieron subir. Revisa el formato y el tamaño.`)
  }

  const items = ordered.map((id) => ({ id }))

  return (
    <div className="space-y-3">
      {ordered.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="list" aria-label="Imágenes del producto">
          <SortableList
            layout="grid"
            items={items}
            disabled={disabled}
            onReorder={(next) => emit(next.map((i) => i.id))}
            labelOf={(item) => `imagen ${ordered.indexOf(item.id) + 1}`}
            renderItem={(item, { dragHandleProps, isDragging, index }) => (
              <ImageTile
                url={signedUrls[item.id]}
                index={index}
                isCover={index === 0}
                isDragging={isDragging}
                dragHandleProps={dragHandleProps}
                disabled={disabled}
                onCover={() => emit([item.id, ...ordered.filter((id) => id !== item.id)])}
                onRemove={() => emit(ordered.filter((id) => id !== item.id))}
              />
            )}
          />
        </div>
      )}
      {!disabled && (
        <DistDropZone
          variant="compact"
          accept="image/*"
          multiple
          maxSizeMB={10}
          onFiles={handleFiles}
          isUploading={uploading > 0}
          emptyLabel={ordered.length ? 'Agregar más imágenes' : 'Agregar imágenes'}
          emptyHint="Arrastra aquí o haz clic. Puedes elegir varias, hasta 10 MB cada una."
          dragActiveLabel="Suelta las imágenes aquí"
        />
      )}
      {ordered.length > 1 && (
        <p className="text-xs text-[hsl(var(--muted-foreground))]">La primera es la portada. Arrastra para cambiar el orden o usa la estrella.</p>
      )}
    </div>
  )
}

function ImageTile({ url, index, isCover, isDragging, dragHandleProps, disabled, onCover, onRemove }) {
  const [broken, setBroken] = useState(false)
  return (
    <div
      role="listitem"
      className={cn(
        'group relative aspect-square overflow-hidden rounded-xl border bg-[hsl(var(--muted))]',
        isCover ? 'border-2 border-(--brand-primary-text) dark:border-(--brand-primary-on-dark)' : 'border-[hsl(var(--border))]',
        isDragging && 'shadow-lg ring-2 ring-[hsl(var(--ring))]',
      )}
    >
      {url && !broken ? (
        <img src={url} alt={isCover ? 'Portada' : `Imagen ${index + 1}`} className="h-full w-full object-cover" draggable={false} onError={() => setBroken(true)} />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-[hsl(var(--muted-foreground))]">
          {url === undefined ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <ImageOff className="h-5 w-5" aria-hidden="true" />}
        </div>
      )}

      {isCover && (
        <span className="absolute bottom-1.5 left-1.5 rounded-md bg-[hsl(var(--card))] px-1.5 py-0.5 text-[11px] font-semibold text-[hsl(var(--foreground))] shadow-sm">Portada</span>
      )}

      {!disabled && (
        <>
          <button
            type="button"
            {...dragHandleProps}
            className="absolute left-1 top-1 flex h-11 w-11 cursor-grab touch-none items-center justify-center rounded-lg bg-black/55 text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white active:cursor-grabbing"
            aria-label={`Mover imagen ${index + 1}`}
            title="Arrastra para ordenar"
          >
            <GripVertical className="h-4 w-4" aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onCover}
            disabled={isCover}
            aria-pressed={isCover}
            className={cn(
              'absolute right-1 top-1 flex h-11 w-11 items-center justify-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white',
              isCover ? 'bg-amber-500 text-white' : 'bg-black/55 text-white hover:bg-black/70',
            )}
            aria-label={isCover ? 'Portada actual' : `Usar imagen ${index + 1} como portada`}
            title={isCover ? 'Portada actual' : 'Usar como portada'}
          >
            <Star className="h-4 w-4" fill={isCover ? 'currentColor' : 'none'} aria-hidden="true" />
          </button>
          <button
            type="button"
            onClick={onRemove}
            className="absolute bottom-1 right-1 flex h-11 w-11 items-center justify-center rounded-lg bg-black/55 text-white opacity-100 hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
            aria-label={`Quitar imagen ${index + 1}`}
            title="Quitar"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </>
      )}
    </div>
  )
}
