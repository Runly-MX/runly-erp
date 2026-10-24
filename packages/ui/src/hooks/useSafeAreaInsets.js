import { useEffect, useState } from 'react'
import { getSafeAreaInsets } from '../lib/safeArea.js'

// Native insets can change without a window resize (Samsung taskbar toggles).
export function useSafeAreaInsets() {
  const [insets, setInsets] = useState(getSafeAreaInsets)
  useEffect(() => {
    const probe = document.createElement('div')
    probe.setAttribute('aria-hidden', 'true')
    probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;width:0;height:0;' +
      'padding:var(--sat,0px) var(--sar,0px) var(--sab,0px) var(--sal,0px);'
    document.body.appendChild(probe)
    const update = () => {
      const next = getSafeAreaInsets()
      setInsets(prev => Object.keys(next).every(key => prev[key] === next[key]) ? prev : next)
    }
    const observer = new ResizeObserver(update)
    observer.observe(probe, { box: 'border-box' })
    update()
    return () => { observer.disconnect(); probe.remove() }
  }, [])
  return insets
}
