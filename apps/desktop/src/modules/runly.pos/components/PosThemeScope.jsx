import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import { Fullscreen, Maximize2, Minimize2 } from 'lucide-react'
import { Button, cn, useViewMode } from '@runly/ui'
import { deriveBrandVars } from '../../../lib/brandTheme.js'
import { usePosSettings } from '../hooks/usePosSettings'
import PosDeviceLinksDialog from './PosDeviceLinksDialog.jsx'
import '../pos-theme.css'

// Only the operating screens (Caja, Comandero, Cocina, register by link) render
// inside this scope: the POS palette, squared radii and tabular numerals, light
// and dark (follows the app's .dark class). Administration screens keep the
// regular Runly look. The body carries it too while mounted, so dialogs, menus
// and toasts portaled outside the screen keep the same identity.
// accent: the company's chosen color (Administración > General); null keeps the orange.
export default function PosThemeScope({ className, accent = null, children }) {
  const style = useMemo(() => accentVars(accent), [accent])
  useEffect(() => {
    const body = document.body
    body.classList.add('pos-theme')
    Object.entries(style ?? {}).forEach(([k, v]) => body.style.setProperty(k, v))
    return () => {
      body.classList.remove('pos-theme')
      Object.keys(style ?? {}).forEach((k) => body.style.removeProperty(k))
    }
  }, [style])
  return <div className={cn('pos-theme flex h-full min-h-0 flex-col', className)} style={style ?? undefined}>{children}</div>
}

const PosViewContext = createContext(null)
// null on the register opened by link (it is already a screen of its own).
export const usePosView = () => useContext(PosViewContext)

const VIEW_LABELS = { normal: 'Vista despejada', clean: 'Pantalla completa', fullscreen: 'Vista normal (Esc)' }

// ERP operating screens: the accent comes from the POS settings; the screen sits
// in the regular layout (ERP top bar, module menu folded) and the POS bar steps
// through the same view cycle as Canvas: normal -> despejada -> pantalla completa.
export function PosOperatingScope({ children }) {
  const { data: settings } = usePosSettings()
  const view = useViewMode()
  const [linksOpen, setLinksOpen] = useState(false)
  const { stepBack, isImmersive } = view
  useEffect(() => {
    if (!isImmersive) return undefined
    const onKey = (e) => { if (e.key === 'Escape' && !e.defaultPrevented && !document.querySelector('[role="dialog"]')) stepBack() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [isImmersive, stepBack])
  const value = useMemo(() => ({ ...view, openLinks: () => setLinksOpen(true) }), [view])
  return (
    <PosViewContext.Provider value={value}>
      <PosThemeScope accent={settings?.accentColor ?? null} className={cn(isImmersive && 'fixed inset-0 z-50 h-dvh')}>
        {children}
        <PosDeviceLinksDialog open={linksOpen} onOpenChange={setLinksOpen} />
      </PosThemeScope>
    </PosViewContext.Provider>
  )
}

// The view-cycle button for the POS bar (Caja, Comandero, Cocina).
export function PosViewToggle() {
  const view = usePosView()
  if (!view) return null
  const Icon = view.mode === 'normal' ? Maximize2 : view.mode === 'clean' ? Fullscreen : Minimize2
  return (
    <Button variant="outline" size="lg" className="h-11 w-11 shrink-0 px-0 max-sm:hidden" onClick={view.cycle} aria-label={VIEW_LABELS[view.mode]} title={VIEW_LABELS[view.mode]}>
      <Icon className="h-5 w-5" aria-hidden="true" />
    </Button>
  )
}

// pos-theme.css reads these and falls back to the orange when they are unset.
export function accentVars(accent) {
  const vars = accent ? deriveBrandVars(accent, { strictContrast: true }) : null
  if (!vars) return null
  return {
    '--pos-accent': vars['--brand-primary'],
    '--pos-accent-hover': vars['--brand-primary-hover'],
    '--pos-accent-foreground': vars['--brand-primary-foreground'],
    '--pos-accent-text': vars['--brand-primary-text'],
    '--pos-accent-on-dark': vars['--brand-primary-on-dark'],
    '--pos-accent-ring': vars['--ring'],
  }
}
