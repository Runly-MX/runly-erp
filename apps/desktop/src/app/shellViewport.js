export function getShellViewportStyle(keyboard) {
  return {
    '--shell-viewport-height': keyboard.open && keyboard.visibleHeight ? `${keyboard.visibleHeight}px` : '100dvh',
    '--shell-bottom-inset': keyboard.open ? '0px' : 'var(--sab, 0px)',
    paddingBottom: keyboard.open ? 0 : 'var(--sab, 0px)',
    ...(keyboard.open && keyboard.visibleHeight
      ? { top: keyboard.offsetTop, height: keyboard.visibleHeight }
      : {}),
  }
}
