import { useState } from 'react'
import { Camera } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@runly/ui'

// Evidence photo taken by the kiosk at punch time: small thumbnail that opens
// a larger view. The URL is a short-lived signed link from the API.
export function PunchSelfie({ url, caption }) {
  const [open, setOpen] = useState(false)
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
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Foto de la checada</DialogTitle></DialogHeader>
          <img src={url} alt="Foto tomada en el kiosko al checar" className="mx-auto max-h-[70vh] w-full rounded-xl object-contain" />
          {caption ? <p className="text-center text-sm text-[hsl(var(--muted-foreground))]">{caption}</p> : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
