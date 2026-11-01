// The shell reserves only the opaque Android navigation bar the native shell publishes
// (--native-inset-bottom). The iOS home indicator floats over content, so in-flow screens
// run to the real bottom edge in the PWA and only `.safe-bottom` controls (composers)
// clear what is left of the inset, via --content-safe-bottom.
export function getShellViewportStyle(keyboard) {
  return {
    '--shell-viewport-height': keyboard.open && keyboard.visibleHeight ? `${keyboard.visibleHeight}px` : '100dvh',
    '--shell-bottom-inset': keyboard.open ? '0px' : 'var(--sab, 0px)',
    '--content-safe-bottom': keyboard.open ? '0px' : 'max(0px, calc(var(--sab, 0px) - var(--native-inset-bottom, 0px)))',
    paddingBottom: keyboard.open ? 0 : 'var(--native-inset-bottom, 0px)',
    ...(keyboard.open && keyboard.visibleHeight
      ? { top: keyboard.offsetTop, height: keyboard.visibleHeight }
      : {}),
  }
}
