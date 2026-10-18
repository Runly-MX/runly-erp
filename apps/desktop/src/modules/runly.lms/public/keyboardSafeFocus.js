import { useEffect } from 'react'

// Public LMS pages are fixed full-viewport containers. On iOS/iPadOS the
// on-screen keyboard does not shrink the layout viewport, so a fixed container
// keeps its full height and the keyboard covers its bottom: a focused field
// near the end cannot be scrolled above the keyboard. These CSS variables
// follow the *visual* viewport so the container shrinks with the keyboard:
//   --public-vh  visible height     --public-vt  visual viewport offset (iOS pans it)
// Roots use PUBLIC_VIEWPORT_CLASS.
export const PUBLIC_VIEWPORT_CLASS = 'fixed inset-x-0 top-0 h-[var(--public-vh,100dvh)] translate-y-[var(--public-vt,0px)]'

export function useVisualViewportVars() {
  useEffect(() => {
    const viewport = typeof window !== 'undefined' ? window.visualViewport : null
    const root = document.documentElement
    if (!viewport) return undefined
    let frame = 0
    const apply = () => {
      frame = 0
      root.style.setProperty('--public-vh', `${Math.round(viewport.height)}px`)
      root.style.setProperty('--public-vt', `${Math.max(0, Math.round(viewport.offsetTop))}px`)
    }
    const schedule = () => { if (!frame) frame = requestAnimationFrame(apply) }
    apply()
    viewport.addEventListener('resize', schedule)
    viewport.addEventListener('scroll', schedule)
    return () => {
      viewport.removeEventListener('resize', schedule)
      viewport.removeEventListener('scroll', schedule)
      if (frame) cancelAnimationFrame(frame)
      root.style.removeProperty('--public-vh')
      root.style.removeProperty('--public-vt')
    }
  }, [])
}

const TOUCH = '(pointer: coarse)'

function center(target) {
  if (!target?.scrollIntoView || !target.isConnected) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
  target.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' })
}

// Join forms on touch devices (phones and tablets): when a field gets focus,
// and again once the keyboard has resized the visual viewport (and with it the
// container above), center it so the field and the button below stay visible.
export function keepFieldVisible(event) {
  const target = event.target
  if (!(target instanceof HTMLElement) || !target.matches('input, textarea')) return
  if (!window.matchMedia?.(TOUCH)?.matches) return
  const viewport = window.visualViewport
  const onResize = () => { if (document.activeElement === target) setTimeout(() => center(target), 50) }
  viewport?.addEventListener('resize', onResize)
  target.addEventListener('blur', () => viewport?.removeEventListener('resize', onResize), { once: true })
  // The keyboard animates in; center after it settles.
  setTimeout(() => { if (document.activeElement === target) center(target) }, 350)
}

// Form classes: 44px inputs on phones plus room above/below a scrolled field.
export const JOIN_FORM_CLASS = 'space-y-4 max-sm:[&_input]:h-11 [&_input]:scroll-my-24'
