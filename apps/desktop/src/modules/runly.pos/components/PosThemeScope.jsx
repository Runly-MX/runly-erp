import { useEffect, useMemo } from 'react'
import { cn } from '@runly/ui'
import { deriveBrandVars } from '../../../lib/brandTheme.js'
import { usePosSettings } from '../hooks/usePosSettings'
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

// ERP operating screens: the accent comes from the POS settings.
export function PosOperatingScope({ children }) {
  const { data: settings } = usePosSettings()
  return <PosThemeScope accent={settings?.accentColor ?? null}>{children}</PosThemeScope>
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
