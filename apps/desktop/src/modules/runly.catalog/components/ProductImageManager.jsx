// apps/desktop/src/modules/runly.catalog/components/ProductImageManager.jsx
import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { DistDropZone } from '@runly/ui'
import { Star, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { runly } from '../../../lib/runly.js'

/**
 * Props:
 *   token       string
 *   coverId     string | null    — current cover_asset_id UUID
 *   imageIds    string[]         — current gallery asset UUIDs
 *   onChange    ({ coverId, imageIds }) => void
 */
export default function ProductImageManager({ token, coverId, imageIds = [], onChange }) {
  const [signedUrls, setSignedUrls] = useState({})

  const allIds = [...new Set([coverId, ...imageIds].filter(Boolean))]

  useEffect(() => {
    if (!allIds.length || !token) return
    runly.files.batchSignedUrls(allIds, token)
      .then(res => {
        const map = {}
        const items = res?.data ?? res?.urls ?? []
        if (Array.isArray(items)) {
          items.forEach(item => { if (item?.fileId && item?.url) map[item.fileId] = item.url })
        } else if (typeof items === 'object' && items !== null) {
          Object.assign(map, items)
        }
        setSignedUrls(map)
      })
      .catch(() => null)
  }, [allIds.join(','), token])

  const uploadMutation = useMutation({
    mutationFn: async (file) => {
      const form = new FormData()
      form.append('file', file)
      // Storefront images: PUBLIC bucket with permanent URLs, owned by the
      // catalog module instead of the uploader's private Files.
      form.append('visibility', 'PUBLIC')
      form.append('moduleKey', 'runly.catalog')
      const res = await runly.files.upload(form, token)
      return res?.data ?? res
    },
  })

  async function handleCoverFile(file) {
    if (!file) return
    try {
      const asset = await uploadMutation.mutateAsync(file)
      onChange({ coverId: asset.id, imageIds })
      toast.success('Imagen de portada actualizada')
    } catch (err) {
      toast.error(err?.message ?? 'Error al subir imagen')
    }
  }

  async function handleGalleryFile(file) {
    if (!file) return
    try {
      const asset = await uploadMutation.mutateAsync(file)
      onChange({ coverId, imageIds: [...imageIds, asset.id] })
      toast.success('Imagen agregada a la galería')
    } catch (err) {
      toast.error(err?.message ?? 'Error al subir imagen')
    }
  }

  function removeCover() { onChange({ coverId: null, imageIds }) }
  function removeFromGallery(id) { onChange({ coverId, imageIds: imageIds.filter(i => i !== id) }) }
  function promoteTocover(id) { onChange({ coverId: id, imageIds: imageIds.filter(i => i !== id) }) }

  return (
    <div className="space-y-6">
      {/* Cover */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-3">Imagen de portada</p>
        <div className="flex items-start gap-4">
          <DistDropZone
            variant="avatar"
            accept="image/*"
            maxSizeMB={10}
            src={coverId ? signedUrls[coverId] : undefined}
            onFile={handleCoverFile}
            isUploading={uploadMutation.isPending}
            fullScreenOverlay
            overlayLabel="Suelta la imagen aqui"
            overlayHint="Imagen de portada del producto"
            emptyLabel="Subir portada"
            className="w-32! h-32! rounded-2xl bg-[hsl(var(--muted))]/40 border-2 border-dashed border-[hsl(var(--border))]"
          />
          {coverId && (
            <button
              type="button"
              onClick={removeCover}
              className="mt-1 flex items-center gap-1 text-xs text-red-500 hover:text-red-700"
            >
              <Trash2 className="h-3 w-3" /> Quitar portada
            </button>
          )}
        </div>
      </div>

      {/* Gallery */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-[hsl(var(--muted-foreground))] mb-3">Galeria adicional</p>
        <div className="flex flex-wrap gap-3">
          {imageIds.map(id => (
            <div key={id} className="group relative h-24 w-24 rounded-xl border border-[hsl(var(--border))] overflow-hidden bg-[hsl(var(--muted))]">
              {signedUrls[id] && <img src={signedUrls[id]} alt="" className="h-full w-full object-cover" />}
              <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => promoteTocover(id)}
                  className="flex items-center gap-1 text-xs text-white hover:text-yellow-300"
                >
                  <Star className="h-3 w-3" /> Portada
                </button>
                <button
                  type="button"
                  onClick={() => removeFromGallery(id)}
                  className="flex items-center gap-1 text-xs text-white hover:text-red-300"
                >
                  <Trash2 className="h-3 w-3" /> Quitar
                </button>
              </div>
            </div>
          ))}
          <DistDropZone
            variant="avatar"
            accept="image/*"
            maxSizeMB={10}
            onFile={handleGalleryFile}
            isUploading={uploadMutation.isPending}
            emptyLabel="Agregar"
            className="w-24 h-24 rounded-xl bg-muted/40 border-2 border-dashed border-border"
          />
        </div>
      </div>
    </div>
  )
}
