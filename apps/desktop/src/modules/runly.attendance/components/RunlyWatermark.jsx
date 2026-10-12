// Subtle Runly branding for the public attendance screens (kiosk, pairing, phone key):
// the isotype plus "Runly" in a corner at low opacity. Decorative, never intercepts taps.
const base = (import.meta.env?.BASE_URL ?? '/').replace(/\/?$/, '/')

export function RunlyWatermark({ position = 'bottom-right', className = '' }) {
  const corner = position === 'bottom-left' ? 'bottom-3 left-4' : position === 'top-left' ? 'top-3 left-4' : 'bottom-3 right-4'
  return (
    <div aria-hidden="true" className={`pointer-events-none fixed ${corner} z-0 flex select-none items-center gap-2 opacity-40 ${className}`}>
      <img src={`${base}brand/runly-logo-isotype.png`} alt="" className="h-6 w-6 object-contain" draggable="false" />
      <span className="text-[11px] font-semibold uppercase tracking-[0.28em] text-white/80">Runly</span>
    </div>
  )
}
