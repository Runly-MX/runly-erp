// Enter in a text input of a modal form runs the modal's primary action, the
// way a <form> would. Used by DialogContent and SheetContent (opt out with
// `submitOnEnter={false}`, or mark any field/ancestor with `data-no-enter-submit`
// for inputs where Enter means something else, like an address search).
const PRIMARY_VARIANTS = new Set(['default', 'primary', 'gradient', 'destructive'])
const NON_TEXT_TYPES = new Set(['checkbox', 'radio', 'file', 'range', 'button', 'submit', 'reset', 'color', 'image'])

export function handleEnterSubmit(event) {
  if (event.key !== 'Enter' || event.shiftKey || event.altKey || event.ctrlKey || event.metaKey || event.defaultPrevented) return
  if (event.nativeEvent?.isComposing) return
  const root = event.currentTarget
  const target = event.target
  // React bubbles events through portals; only inputs physically inside the modal count.
  if (!(target instanceof HTMLElement) || target.tagName !== 'INPUT' || !root?.contains?.(target)) return
  if (NON_TEXT_TYPES.has((target.getAttribute('type') || 'text').toLowerCase())) return
  if (target.closest('[data-no-enter-submit]')) return
  if (target.getAttribute('role') === 'combobox' || target.hasAttribute('aria-autocomplete') || target.getAttribute('aria-expanded') === 'true') return
  // Footer marked with data-dialog-footer (SheetFooter/DialogFooter); custom footers
  // fall back to the last primary-style button in the modal.
  const scope = root.querySelector('[data-dialog-footer]') ?? root
  const buttons = [...scope.querySelectorAll('button:not([disabled])')].filter((b) => !['switch', 'checkbox'].includes(b.getAttribute('role') ?? '') && !b.closest('[data-no-enter-submit]'))
  const primary = [...buttons].reverse().find((b) => PRIMARY_VARIANTS.has(b.dataset.variant ?? '')) ?? (scope === root ? null : buttons[buttons.length - 1])
  if (!primary) return
  event.preventDefault()
  primary.click()
}
