export function floatingChatBounds({ height, safeArea, keyboard, y, size = 56, margin = 16 }) {
  const top = Math.max(safeArea.top + 56, keyboard.offsetTop) + margin
  const bottom = Math.min(height - safeArea.bottom,
    keyboard.visibleHeight ? keyboard.offsetTop + keyboard.visibleHeight : height) - margin
  return { top, bottom, y: Math.max(top, Math.min(y ?? Math.round(height * 0.75), bottom - size)) }
}

export function miniChatViewportStyle(keyboard, margin = 16) {
  const bottom = `calc(${margin}px + max(${keyboard.inset}px, var(--sab, 0px)))`
  return {
    bottom,
    maxHeight: `calc(100dvh - ${bottom} - var(--sat, 0px) - var(--topbar-height, 56px) - ${margin}px)`,
  }
}
