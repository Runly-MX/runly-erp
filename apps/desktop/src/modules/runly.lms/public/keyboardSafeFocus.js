// Join forms on phones: when a field gets focus (and again once the on-screen
// keyboard has resized the visual viewport), center it so the field and the
// submit button right below it stay visible. Desktop is left alone.
const PHONE = '(max-width: 639px)'

function center(target) {
  if (!target?.scrollIntoView || !target.isConnected) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  target.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
}

export function keepFieldVisible(event) {
  const target = event.target
  if (!(target instanceof HTMLElement) || !target.matches('input, textarea')) return
  if (!window.matchMedia?.(PHONE)?.matches) return
  const viewport = window.visualViewport
  const onResize = () => { if (document.activeElement === target) center(target) }
  viewport?.addEventListener('resize', onResize)
  target.addEventListener('blur', () => viewport?.removeEventListener('resize', onResize), { once: true })
  // The keyboard animates in; center after it settles.
  setTimeout(() => { if (document.activeElement === target) center(target) }, 300)
}

// Form classes: 44px inputs on phones plus room above/below a scrolled field.
export const JOIN_FORM_CLASS = 'space-y-4 max-sm:[&_input]:h-11 [&_input]:scroll-my-24'
