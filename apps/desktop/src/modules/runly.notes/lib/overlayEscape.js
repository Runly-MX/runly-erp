// Escape closes the note overlay (home layout) only when nothing else owns the
// key: another layer already handled it (defaultPrevented), a dialog/sheet/
// popover/menu is open, an IME composition is active, or zen mode is on (zen
// has its own Escape that first steps back to the normal view).
export function shouldCloseOverlayOnEscape({
  defaultPrevented = false,
  hasOpenDialog = false,
  zenMode = false,
  isComposing = false,
  key,
}) {
  return key === 'Escape' && !defaultPrevented && !hasOpenDialog && !zenMode && !isComposing
}

// Radix-based layers (Dialog, Sheet, Popover, DropdownMenu) mark themselves
// with role + data-state="open" while mounted.
export const OPEN_LAYER_SELECTOR = [
  '[role="dialog"][data-state="open"]',
  '[role="alertdialog"][data-state="open"]',
  '[role="menu"][data-state="open"]',
  '[role="listbox"][data-state="open"]',
].join(', ')

export function hasOpenOverlayLayer(doc = document) {
  return Boolean(doc.querySelector(OPEN_LAYER_SELECTOR))
}
