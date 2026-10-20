import { useCallback, useEffect, useState } from 'react'

const STORAGE_KEY = 'runly.inventory.areaTree.open'
const QUERY = '(min-width: 1024px)'

function readOpen() {
  try { return window.localStorage.getItem(STORAGE_KEY) !== 'false' } catch { return true }
}

// lg+ => docked panel whose collapsed state is remembered; below lg => modal sheet.
export function useAreaTreeDock() {
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== 'undefined' && window.matchMedia(QUERY).matches)
  const [dockOpen, setDockOpen] = useState(readOpen)
  const [sheetOpen, setSheetOpen] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia(QUERY)
    const onChange = () => setIsDesktop(mq.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
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

  return { isDesktop, dockOpen, sheetOpen, setSheetOpen, toggle, active: isDesktop ? dockOpen : sheetOpen }
}
