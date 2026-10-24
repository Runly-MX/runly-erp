export const NOTE_TOUCH_BAR_HEIGHT = 48

export function noteToolbarPlacement({ coarse, viewing, keyboard }) {
  // A taskbar/viewport gap is not necessarily an open keyboard. Use the
  // keyboard-open signal for consumers that need a full keyboard inset.
  const viewportInset = !viewing ? Math.max(0, keyboard?.inset || 0) : 0
  const keyboardInset = keyboard?.open ? viewportInset : 0
  const barVisible = Boolean(coarse && !viewing)
  return {
    keyboardInset,
    barVisible,
    // Also clear short IME/handwriting strips that do not cross the full
    // keyboard-height threshold, as well as the Android system bars.
    barBottom: `max(${viewportInset}px, var(--sab, 0px))`,
  }
}
