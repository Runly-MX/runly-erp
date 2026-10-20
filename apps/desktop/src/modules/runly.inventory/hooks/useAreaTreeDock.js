import { useCallback, useEffect, useMemo, useState } from 'react'
import { clampTreeWidth, maxTreeWidth, TREE_DEFAULT } from '../lib/area-tree-resize.js'

const STORAGE_KEY = 'runly.inventory.areaTree.open'
const WIDTH_KEY = 'runly.inventory.areaTree.width'
const QUERY = '(min-width: 1024px)'

function readOpen() {
  try { return window.localStorage.getItem(STORAGE_KEY) !== 'false' } catch { return true }
}

function readWidth() {
  try {
    const raw = window.localStorage.getItem(WIDTH_KEY)
    return raw == null ? TREE_DEFAULT : clampTreeWidth(Number(raw))
  } catch { return TREE_DEFAULT }
}

// lg+ => docked panel whose collapsed state and width are remembered; below lg => modal sheet.
// `containerRef` goes on the flex row holding dock + table so the max width can leave the table its minimum.
export function useAreaTreeDock() {
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(QUERY).matches)
  const [dockOpen, setDockOpen] = useState(readOpen)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [storedWidth, setStoredWidth] = useState(readWidth)
  const [containerEl, containerRef] = useState(null)
  const [containerWidth, setContainerWidth] = useState(0)

  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = () => setIsDesktop(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    if (!containerEl || typeof ResizeObserver === 'undefined') return undefined
    const update = () => setContainerWidth(containerEl.clientWidth)
    update()
    const observer = new ResizeObserver(update)
    observer.observe(containerEl)
    return () => observer.disconnect()
  }, [containerEl])

  const maxWidth = useMemo(() => maxTreeWidth(containerWidth), [containerWidth])
  const width = clampTreeWidth(storedWidth, maxWidth)

  const setWidth = useCallback((next) => {
    const value = clampTreeWidth(next)
    setStoredWidth(value)
    try { window.localStorage.setItem(WIDTH_KEY, String(value)) } catch { /* storage unavailable */ }
  }, [])

  const toggle = useCallback(() => {
    if (isDesktop) {
      setDockOpen((open) => {
        try { window.localStorage.setItem(STORAGE_KEY, String(!open)) } catch { /* storage unavailable */ }
        return !open
      })
    } else {
      setSheetOpen((open) => !open)
    }
  }, [isDesktop])

  return {
    isDesktop, dockOpen, sheetOpen, setSheetOpen, toggle, active: isDesktop ? dockOpen : sheetOpen,
    width, maxWidth, setWidth, containerRef,
  }
}
