import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { Button } from '@runly/ui'
import { Camera, ImageIcon, Loader2, RefreshCw, Trash2 } from 'lucide-react'
import { useToken } from '../../hooks/useLmsData.js'
import { uploadLessonCover } from '../../lib/uploadLessonVideo.js'
import { MediaCard } from './MediaCard.jsx'

const MAX_BYTES = 5 * 1024 * 1024

// Lesson thumbnail card (16:9). value/onChange: { fileId, url, auto? } | null.
// `captureFrame()` resolves a JPEG Blob of the preview player's current frame
// ("Usar este fotograma"); omitted when there is no playable preview.
export function LessonCoverField({ value, onChange, disabled = false, lessonId = null, captureFrame = null, onBusyChange }) {
  const token = useToken()
  const inputRef = useRef(null)
  const [busy, setBusy] = useState(null) // 'upload' | 'frame' | null
  const [dragOver, setDragOver] = useState(false)

  async function run(kind, getImage, fileName) {
    setBusy(kind)
    onBusyChange?.(true)
    try {
      const image = await getImage()
      const result = await uploadLessonCover(image, token, { lessonId, fileName })
      onChange({ fileId: result.coverFileId, url: result.coverUrl, auto: false })
    } catch (error) {
      toast.error(error?.message || 'No se pudo guardar la miniatura.')
    } finally {
      setBusy(null)
      onBusyChange?.(false)
    }
  }

  function uploadImage(file) {
    if (!file || disabled || busy) return
    if (!String(file.type).startsWith('image/')) { toast.error('El archivo debe ser una imagen.'); return }
    if (file.size > MAX_BYTES) { toast.error('La imagen supera 5 MB.'); return }
    run('upload', async () => file, file.name)
  }

  const takeFrame = () => run('frame', captureFrame, 'fotograma.jpg')
  const pick = () => inputRef.current?.click()
  const canDrop = !disabled && !busy

  return (
    <MediaCard
      label="Miniatura" hint="Imagen 16:9 (JPG, PNG o WebP, máximo 5 MB) o un fotograma del video."
      dashed={!value?.url} highlighted={dragOver}
      onDragOver={(event) => { if (!canDrop) return; event.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        if (!canDrop) return
        event.preventDefault()
        setDragOver(false)
        uploadImage(event.dataTransfer.files?.[0])
      }}
      actions={disabled ? null : (
        <>
          {value ? <Button type="button" size="sm" variant="outline" className="flex-1" disabled={Boolean(busy)} onClick={pick}><RefreshCw />Cambiar</Button> : null}
          {captureFrame ? (
            <Button type="button" size="sm" variant="outline" className="flex-1" disabled={Boolean(busy)} onClick={takeFrame}>
              {busy === 'frame' ? <Loader2 className="animate-spin motion-reduce:animate-none" /> : <Camera />}Usar este fotograma
            </Button>
          ) : null}
          {value ? (
            <Button type="button" size="sm" variant="outline" className="text-[hsl(var(--destructive))]" disabled={Boolean(busy)} onClick={() => onChange(null)}><Trash2 />Quitar</Button>
          ) : null}
        </>
      )}
    >
      {busy ? (
        <div className="flex size-full items-center justify-center" aria-live="polite">
          <Loader2 className="size-7 animate-spin text-[hsl(var(--muted-foreground))] motion-reduce:animate-none" aria-hidden />
          <span className="sr-only">Guardando miniatura</span>
        </div>
      ) : value?.url ? (
        <img src={value.url} alt="Miniatura de la lección" className="size-full object-cover" />
      ) : (
        <button
          type="button" disabled={disabled} onClick={pick}
          className="flex size-full flex-col items-center justify-center gap-2 p-4 text-center transition-colors hover:bg-[hsl(var(--muted)/0.7)] disabled:cursor-not-allowed disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]"
        >
          <span className="flex size-12 items-center justify-center rounded-full bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]"><ImageIcon className="size-6" aria-hidden /></span>
          <span className="text-sm font-medium">{value ? 'Miniatura guardada' : 'Subir miniatura'}</span>
          <span className="text-xs text-[hsl(var(--muted-foreground))]">
            {value ? 'No se pudo cargar la vista previa.' : 'Si no eliges una, se toma un fotograma del video.'}
          </span>
        </button>
      )}
      <input
        ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" tabIndex={-1} aria-hidden
        onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; uploadImage(file) }}
      />
    </MediaCard>
  )
}
