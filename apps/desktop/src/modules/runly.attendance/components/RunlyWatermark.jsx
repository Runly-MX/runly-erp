// Subtle Runly branding for the public attendance screens (kiosk, pairing, phone key):
// the horizontal logo (dark-surface variant) in a corner at reduced opacity. Decorative,
// never intercepts taps. On phones it sits in the page flow (centered, last element) so it
// can never cover the keypad; from sm up it floats in the corner.
const base = (import.meta.env?.BASE_URL ?? '/').replace(/\/?$/, '/')

export function RunlyWatermark({ position = 'bottom-right', className = '' }) {
  const corner = position === 'bottom-left' ? 'bottom-4 left-5' : position === 'top-left' ? 'top-4 left-5' : 'bottom-4 right-5'
  return (
    <div aria-hidden="true" className={`pointer-events-none select-none opacity-60 max-sm:static max-sm:mx-auto max-sm:mb-3 max-sm:mt-1 max-sm:flex max-sm:justify-center sm:fixed ${corner} z-0 ${className}`}>
      <img src={`${base}runly/runly-logo-horizontal-dark.png`} alt="" className="h-7 w-auto object-contain sm:h-11" draggable="false" />
    </div>
  )
}
