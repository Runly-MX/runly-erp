// A dialog opened in the same instant a Radix menu closes leaves the page unclickable
// (`pointer-events: none` stays on <body>): the menu's exit and focus return overlap the
// dialog's own lock. Open overlays launched from a menu through `afterMenu`, and call
// `releaseStuckPointer` when one closes as a safety net.
export const MENU_CLOSE_MS = 220;

export function afterMenu(callback) {
  return window.setTimeout(callback, MENU_CLOSE_MS);
}

// If nothing modal is open any more but <body> is still locked, unlock it.
export function releaseStuckPointer() {
  window.setTimeout(() => {
    const body = document.body;
    if (body?.style.pointerEvents !== "none") return;
    const open = body.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="menu"][data-state="open"]');
    if (!open) body.style.pointerEvents = "";
  }, 400);
}
