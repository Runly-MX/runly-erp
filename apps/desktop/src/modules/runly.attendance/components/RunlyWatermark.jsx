// Subtle Runly branding for the public attendance screens (kiosk, pairing, phone key):
// the horizontal logo (dark-surface variant) in a corner at reduced opacity. Decorative,
// never intercepts taps.
const base = (import.meta.env?.BASE_URL ?? '/').replace(/\/?$/, '/')

export function RunlyWatermark({ position = 'bottom-right', className = '' }) {
  const corner = position === 'bottom-left' ? 'bottom-4 left-5' : position === 'top-left' ? 'top-4 left-5' : 'bottom-4 right-5'
  return (
    <div aria-hidden="true" className={`pointer-events-none fixed ${corner} z-0 select-none opacity-60 ${className}`}>
      <img src={`${base}runly/runly-logo-horizontal-dark.png`} alt="" className="h-9 w-auto object-contain sm:h-11" draggable="false" />
    </div>
  )
}
