import {
  Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, ProgressBar,
} from '@runly/ui'
import { Building2, ListTree, LogOut, Moon, MoreVertical, Sun } from 'lucide-react'
import { ThemeToggle } from '../../../components/ThemeToggle.jsx'
import { useThemeStore } from '../../../stores/theme.js'
import { PublicFixedBar } from './PublicFixedBar.jsx'

const MUTED = 'text-[hsl(var(--muted-foreground))]'

export function CompanyMark({ company }) {
  return company?.logoUrl
    ? <img src={company.logoUrl} alt="" className="h-9 w-9 shrink-0 rounded-md border border-[hsl(var(--border))] bg-white object-contain p-0.5" />
    : (
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[hsl(var(--muted))] text-sm font-semibold uppercase">
        {company?.name ? company.name.trim().charAt(0) : <Building2 className="h-4 w-4" aria-hidden="true" />}
      </span>
    )
}

function Progress({ pct, className }) {
  return (
    <div className={className}>
      <ProgressBar value={pct} className="h-1.5 flex-1" aria-label={`Tu avance: ${pct}%`} />
      <span className="text-xs font-medium tabular-nums">{pct}%</span>
    </div>
  )
}

// Guest player top bar. Phones: one compact row (logo, company eyebrow, course
// title on one line) plus a menu with the content jump, progress and "No soy".
// sm+: progress bar, a "Contenido" jump below lg (the outline is a side column
// from lg) and the sign-out button. Safe areas keep it clear of the notch.
export function SharedPlayerHeader({ company, title, pct, guestName, onShowContent, onSignOut }) {
  const signOutLabel = guestName ? `No soy ${guestName}` : 'Cambiar de persona'
  // Let the menu close (and restore focus) before scrolling to the outline.
  const showContent = () => requestAnimationFrame(() => onShowContent())
  const { isDark, toggle: toggleTheme } = useThemeStore()
  return (
    <PublicFixedBar>
      <div className="mx-auto flex w-full max-w-[1600px] items-center gap-3 py-2 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] sm:px-6 sm:py-2.5 lg:px-8">
        <CompanyMark company={company} />
        <div className="min-w-0 flex-1">
          <p className={`truncate text-[11px] font-medium uppercase tracking-wide ${MUTED}`}>{company?.name || 'Curso compartido'}</p>
          <h1 className="truncate text-sm font-semibold leading-tight sm:text-base">{title}</h1>
        </div>

        <div className="hidden shrink-0 items-center gap-3 sm:flex">
          <div className="w-40 space-y-1">
            <p className={`text-[11px] font-medium ${MUTED}`}>Tu avance</p>
            <Progress pct={pct} className="flex items-center gap-2" />
          </div>
          <Button variant="outline" size="sm" className="lg:hidden" onClick={onShowContent}><ListTree />Contenido</Button>
          <ThemeToggle />
          <span className="h-6 w-px bg-[hsl(var(--border))]" aria-hidden="true" />
          <Button variant="ghost" size="sm" onClick={onSignOut} className="max-w-56" title="Olvidar este nombre en este navegador y empezar de nuevo">
            <LogOut /><span className="truncate">{signOutLabel}</span>
          </Button>
        </div>

        <Button variant="outline" size="icon" className="shrink-0 sm:hidden" aria-label="Contenido del curso" onClick={onShowContent}><ListTree /></Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="shrink-0 sm:hidden" aria-label="Menú del curso"><MoreVertical /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[min(18rem,calc(100vw-2rem))]">
            <DropdownMenuLabel className="space-y-1.5 py-2">
              <span className={`block text-xs font-medium ${MUTED}`}>Tu avance</span>
              <Progress pct={pct} className="flex items-center gap-2" />
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-11" onSelect={showContent}><ListTree />Contenido del curso</DropdownMenuItem>
            <DropdownMenuItem className="min-h-11" onSelect={toggleTheme}>{isDark ? <Sun /> : <Moon />}{isDark ? 'Modo claro' : 'Modo oscuro'}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="min-h-11" onSelect={onSignOut}>
              <LogOut /><span className="truncate">{signOutLabel}</span>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </PublicFixedBar>
  )
}
