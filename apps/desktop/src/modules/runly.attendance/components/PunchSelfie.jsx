import { useCallback, useState } from 'react'
import { Camera } from 'lucide-react'
import { AdvancedFileViewer } from '@runly/ui'

// Evidence photo taken by the kiosk at punch time: small thumbnail that opens the shared
// image viewer with the FULL-size file (the thumbnail variant is low resolution, enlarging it
// looked blurry). URLs are short-lived signed links from the API.
export function PunchSelfie({ url, fullUrl, caption, id }) {
  const [open, setOpen] = useState(false)
  const full = fullUrl ?? url
  const resolve = useCallback(async () => full, [full])
  if (!url) return null
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Ver foto de la checada"
        className="relative h-9 w-9 shrink-0 overflow-hidden rounded-lg border border-[hsl(var(--border))] outline-none transition hover:ring-2 hover:ring-(--brand-primary) focus-visible:ring-2 focus-visible:ring-(--brand-primary) max-sm:h-11 max-sm:w-11"
      >
        <img src={url} alt="" className="h-full w-full object-cover" loading="lazy" />
        <Camera className="absolute bottom-0.5 right-0.5 h-3 w-3 rounded bg-black/50 p-0.5 text-white" aria-hidden="true" />
      </button>
      {open ? (
        <AdvancedFileViewer imageEditing={false}
          open={open}
          onOpenChange={setOpen}
          files={[{ id: id ?? caption ?? 'selfie', mimeType: 'image/jpeg', originalName: caption ?? 'Foto de la checada', sizeBytes: 0 }]}
          activeIndex={0}
          onIndexChange={() => {}}
          onResolveSignedUrl={resolve}
        />
      ) : null}
    </>
  )
}
