// Public pages scroll the document (PublicShell opts html/body out of the
// global scroll lock): headers are `sticky`, nothing is `fixed` full screen.
export const PUBLIC_PAGE_CLASS = 'min-h-dvh bg-[hsl(var(--background))]'

const TOUCH = '(pointer: coarse)'

function center(target) {
  if (!target?.scrollIntoView || !target.isConnected) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  target.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
}

// Join forms on touch devices (phones and tablets): once the keyboard has
// opened, center the focused field so it and the button below stay visible.
export function keepFieldVisible(event) {
  const target = event.target
  if (!(target instanceof HTMLElement) || !target.matches('input, textarea')) return
  if (!window.matchMedia?.(TOUCH)?.matches) return
  const viewport = window.visualViewport
  const onResize = () => { if (document.activeElement === target) setTimeout(() => center(target), 50) }
  viewport?.addEventListener('resize', onResize)
  target.addEventListener('blur', () => viewport?.removeEventListener('resize', onResize), { once: true })
  setTimeout(() => { if (document.activeElement === target) center(target) }, 350)
}

// Form classes: 44px inputs on phones plus room above/below a scrolled field.
export const JOIN_FORM_CLASS = 'space-y-4 max-sm:[&_input]:h-11 [&_input]:scroll-my-24'
