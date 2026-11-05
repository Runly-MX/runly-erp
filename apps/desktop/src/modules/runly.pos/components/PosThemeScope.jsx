import { useEffect } from 'react'
import { cn } from '@runly/ui'
import '../pos-theme.css'

// Every POS screen renders inside this scope: the POS palette, squared radii
// and tabular numerals, light and dark (follows the app's .dark class). The
// body carries it too while a POS screen is mounted, so dialogs, menus and
// toasts portaled outside the screen keep the same identity.
export default function PosThemeScope({ className, children }) {
  useEffect(() => {
    document.body.classList.add('pos-theme')
    return () => document.body.classList.remove('pos-theme')
  }, [])
  return <div className={cn('pos-theme flex h-full min-h-0 flex-col', className)}>{children}</div>
}
