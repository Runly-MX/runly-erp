import { useEffect, useMemo, useRef } from 'react'
import { Button } from '@runly/ui'
import { FileText, ImagePlus, X } from 'lucide-react'
import { toast } from 'sonner'
import { muted } from './GuestPortalParts.jsx'
import { GuestItemFiles } from './GuestItemFiles.jsx'

const MAX_BYTES = 10 * 1024 * 1024
export const MAX_STAGED = 20

// Photos and documents on the form. Editing uploads immediately (GuestItemFiles); creating stages the
// files and the page uploads them once the item exists, like the main form (stage-until-parent-create).
export function GuestFormFiles({ itemId, canWrite = true, staged, onStagedChange }) {
  const input = useRef(null)
  const previews = useMemo(() => staged.map((f) => (f.type.startsWith('image/') ? URL.createObjectURL(f) : null)), [staged])
  useEffect(() => () => previews.forEach((u) => u && URL.revokeObjectURL(u)), [previews])

  if (itemId) return <GuestItemFiles itemId={itemId} canWrite={canWrite} />

  function onPick(event) {
    const picked = Array.from(event.target.files ?? [])
    event.target.value = ''
    const ok = picked.filter((f) => (f.size <= MAX_BYTES ? true : (toast.error(`${f.name} supera los 10 MB`), false)))
    onStagedChange([...staged, ...ok].slice(0, MAX_STAGED))
  }

  return (
    <div className="space-y-3">
      <input ref={input} type="file" multiple accept="image/*,application/pdf" className="sr-only" onChange={onPick} />
      <button type="button" onClick={() => input.current?.click()}
        className="flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-[hsl(var(--border))] px-4 py-6 text-center transition-colors hover:border-(--brand-primary)/60 hover:bg-[hsl(var(--muted))]/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] motion-reduce:transition-none">
        <ImagePlus className={`h-6 w-6 ${muted}`} />
        <span className="text-sm font-medium">Agregar fotos o archivos</span>
        <span className={`text-xs ${muted}`}>Imágenes o PDF, hasta 10 MB cada uno. Se suben al guardar.</span>
      </button>
      {staged.length ? (
        <ul className="grid grid-cols-3 gap-2">
          {staged.map((file, i) => (
            <li key={`${file.name}-${i}`} className="group relative overflow-hidden rounded-md border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/40">
              {previews[i]
                ? <img src={previews[i]} alt={file.name} className="aspect-square w-full object-cover" />
                : <span className="flex aspect-square w-full flex-col items-center justify-center gap-1 p-2 text-center"><FileText className={`h-5 w-5 ${muted}`} /><span className="line-clamp-2 break-all text-[11px]">{file.name}</span></span>}
              <Button type="button" variant="secondary" size="icon" aria-label={`Quitar ${file.name}`} className="absolute right-1 top-1 h-8 w-8"
                onClick={() => onStagedChange(staged.filter((_, j) => j !== i))}><X className="h-3.5 w-3.5" /></Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}
