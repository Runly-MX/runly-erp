// Stylus handwriting (Samsung S Pen, Android 14+ Chromium) only starts on a
// text field that already owns focus, and most single-line inputs plus the chat
// composer never get it because a pen-down on a not-yet-focused field is
// consumed by ancestor gesture handlers. Focus the field on pen-down, in the
// capture phase, so the IME can begin handwriting on the first stroke.
const EDITABLE = 'textarea, input:not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="file"]):not([type="range"]):not([type="color"]), [contenteditable=""], [contenteditable="true"]'

export function installPenInput() {
  if (typeof document === 'undefined' || window.__runlyPenInput) return
  window.__runlyPenInput = true
  document.addEventListener(
    'pointerdown',
    (event) => {
      if (event.pointerType !== 'pen') return
      const field = event.target?.closest?.(EDITABLE)
      if (!field || field.disabled || field.readOnly || document.activeElement === field) return
      field.focus({ preventScroll: true })
    },
    true,
  )
}
