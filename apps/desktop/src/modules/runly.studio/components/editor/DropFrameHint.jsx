import { ImageDown } from 'lucide-react'

// Highlight of the frame/shape a dragged photo will fill (page coordinates).
export function DropFrameHint({ frame, zoom }) {
  return (
    <div aria-hidden className="pointer-events-none absolute z-20 rounded-[2px] bg-fuchsia-500/15"
      style={{ left: frame.x, top: frame.y, width: frame.width, height: frame.height, transform: `rotate(${frame.rotation ?? 0}deg)`, transformOrigin: 'top left',
        outline: `${3 / zoom}px dashed #d946ef`, outlineOffset: `${2 / zoom}px` }}>
      <span className="absolute left-1/2 top-1/2 flex items-center gap-1.5 whitespace-nowrap rounded-full bg-fuchsia-600 px-2.5 py-1 text-xs font-semibold text-white shadow-lg"
        style={{ transform: `translate(-50%, -50%) scale(${1 / zoom})` }}>
        <ImageDown className="h-3.5 w-3.5" />Suelta para rellenar
      </span>
    </div>
  )
}
