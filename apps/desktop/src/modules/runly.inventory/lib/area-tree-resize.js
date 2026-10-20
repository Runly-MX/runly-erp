// Pure math for the resizable folder-tree sidebar (docked mode).
export const TREE_MIN = 200
export const TREE_MAX = 420
export const TREE_DEFAULT = 256
export const TABLE_MIN = 480
export const TREE_GAP = 16
export const STEP = 16
export const STEP_LARGE = 48

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max)

// Largest sidebar width that still leaves the table `tableMin` px (plus the gap). Never below `min`.
export function maxTreeWidth(containerWidth, { min = TREE_MIN, max = TREE_MAX, tableMin = TABLE_MIN, gap = TREE_GAP } = {}) {
  if (!Number.isFinite(containerWidth) || containerWidth <= 0) return max
  return Math.max(min, Math.min(max, Math.floor(containerWidth - tableMin - gap)))
}

export function clampTreeWidth(width, max = TREE_MAX) {
  const n = Number(width)
  return clamp(Number.isFinite(n) ? Math.round(n) : TREE_DEFAULT, TREE_MIN, Math.max(TREE_MIN, max))
}

// Keyboard resize: returns the next width, or null when the key is not handled.
export function keyboardTreeWidth(current, key, shift, max = TREE_MAX) {
  const step = shift ? STEP_LARGE : STEP
  if (key === 'ArrowLeft') return clampTreeWidth(current - step, max)
  if (key === 'ArrowRight') return clampTreeWidth(current + step, max)
  if (key === 'Home') return TREE_MIN
  if (key === 'End') return clampTreeWidth(max, max)
  if (key === 'Enter') return clampTreeWidth(TREE_DEFAULT, max)
  return null
}
