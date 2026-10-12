import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { cn } from '../lib/utils.js'

// Colored chip tabs with a sliding indicator and a description banner.
// Controlled: pass `value` / `onChange`. Pair with <ChipTabPanel> for content.

const TONES = {
  teal: { solid: 'bg-teal-600', shadow: 'shadow-teal-600/30', banner: 'border-teal-600/25 bg-teal-600/10', icon: 'bg-teal-600 text-white', focus: 'focus-visible:ring-teal-600' },
  blue: { solid: 'bg-blue-600', shadow: 'shadow-blue-600/30', banner: 'border-blue-600/25 bg-blue-600/10', icon: 'bg-blue-600 text-white', focus: 'focus-visible:ring-blue-600' },
  violet: { solid: 'bg-violet-600', shadow: 'shadow-violet-600/30', banner: 'border-violet-600/25 bg-violet-600/10', icon: 'bg-violet-600 text-white', focus: 'focus-visible:ring-violet-600' },
  amber: { solid: 'bg-amber-600', shadow: 'shadow-amber-600/30', banner: 'border-amber-600/25 bg-amber-600/10', icon: 'bg-amber-600 text-white', focus: 'focus-visible:ring-amber-600' },
  rose: { solid: 'bg-rose-600', shadow: 'shadow-rose-600/30', banner: 'border-rose-600/25 bg-rose-600/10', icon: 'bg-rose-600 text-white', focus: 'focus-visible:ring-rose-600' },
}

const PanelContext = createContext({ baseId: '' })

// Flips to true on the next frame after mount / key change so a CSS transition
// can play from the "from" state to the "to" state.
function useEntered(key) {
  const [entered, setEntered] = useState(false)
  useEffect(() => {
    setEntered(false)
    const frame = requestAnimationFrame(() => setEntered(true))
    return () => cancelAnimationFrame(frame)
  }, [key])
  return entered
}

export function ChipTabs({ tabs = [], value, onChange, tone = 'teal', ariaLabel, showDescription = true, className }) {
  const baseId = useId()
  const palette = TONES[tone] ?? TONES.teal
  const listRef = useRef(null)
  const tabRefs = useRef(new Map())
  const [indicator, setIndicator] = useState(null) // { x, w }
  const activeTab = tabs.find((t) => t.value === value) ?? tabs[0]
  const activeValue = activeTab?.value

  const measure = useCallback(() => {
    const node = tabRefs.current.get(activeValue)
    if (!node) { setIndicator(null); return }
    setIndicator((prev) => (prev && prev.x === node.offsetLeft && prev.w === node.offsetWidth ? prev : { x: node.offsetLeft, w: node.offsetWidth }))
  }, [activeValue])

  useLayoutEffect(() => { measure() }, [measure, tabs.length])

  useEffect(() => {
    const list = listRef.current
    if (!list) return undefined
    let observer = null
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(() => measure())
      observer.observe(list)
      tabRefs.current.forEach((node) => observer.observe(node))
    }
    window.addEventListener('resize', measure)
    document.fonts?.ready?.then(measure).catch(() => {})
    return () => { observer?.disconnect(); window.removeEventListener('resize', measure) }
  }, [measure, tabs.length])

  // Keep the active chip visible in the horizontally scrollable strip.
  useEffect(() => {
    const node = tabRefs.current.get(activeValue)
    if (node && typeof node.scrollIntoView === 'function') node.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [activeValue])

  function onKeyDown(event) {
    const index = tabs.findIndex((t) => t.value === activeValue)
    let next = -1
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length
    else if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = tabs.length - 1
    if (next < 0) return
    event.preventDefault()
    const target = tabs[next]
    onChange?.(target.value)
    tabRefs.current.get(target.value)?.focus()
  }

  const bannerEntered = useEntered(activeValue)
  const ActiveIcon = activeTab?.icon

  return (
    <PanelContext.Provider value={{ baseId }}>
      <div className={cn('min-w-0', className)}>
        <div className="-mx-1 overflow-x-auto px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div
            ref={listRef}
            role="tablist"
            aria-label={ariaLabel}
            onKeyDown={onKeyDown}
            className="relative inline-flex min-w-max gap-1 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/60 p-1"
          >
            {indicator ? (
              <span
                aria-hidden="true"
                className={cn('pointer-events-none absolute bottom-1 left-0 top-1 rounded-xl shadow-md transition-[transform,width] duration-250 ease-out motion-reduce:transition-none', palette.solid, palette.shadow)}
                style={{ width: indicator.w, transform: `translateX(${indicator.x}px)` }}
              />
            ) : null}
            {tabs.map((tab) => {
              const selected = tab.value === activeValue
              const Icon = tab.icon
              return (
                <button
                  key={tab.value}
                  ref={(node) => { if (node) tabRefs.current.set(tab.value, node); else tabRefs.current.delete(tab.value) }}
                  type="button"
                  role="tab"
                  id={`${baseId}-tab-${tab.value}`}
                  aria-selected={selected}
                  aria-controls={`${baseId}-panel-${tab.value}`}
                  tabIndex={selected ? 0 : -1}
                  onClick={() => onChange?.(tab.value)}
                  className={cn(
                    'relative z-10 inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-xl px-4 py-2 text-sm font-medium outline-none transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-1 motion-reduce:transition-none sm:min-h-9',
                    palette.focus,
                    selected
                      ? cn('text-white', !indicator && cn(palette.solid, 'shadow-md', palette.shadow))
                      : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--background))]/70 hover:text-[hsl(var(--foreground))] active:scale-[0.98]',
                  )}
                >
                  {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                  {tab.label}
                  {tab.badge != null && tab.badge !== '' ? (
                    <span className={cn('rounded-full px-1.5 text-[11px] font-semibold tabular-nums', selected ? 'bg-white/25 text-white' : 'bg-[hsl(var(--background))] text-[hsl(var(--muted-foreground))]')}>
                      {tab.badge}
                    </span>
                  ) : null}
                </button>
              )
            })}
          </div>
        </div>

        {showDescription && activeTab?.description ? (
          <div
            key={activeValue}
            className={cn(
              'mt-3 flex items-start gap-3 rounded-xl border px-4 py-3 transition duration-200 ease-out motion-reduce:transition-none',
              palette.banner,
              bannerEntered ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100',
            )}
          >
            {ActiveIcon ? (
              <span className={cn('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', palette.icon)}>
                <ActiveIcon className="h-4 w-4" aria-hidden="true" />
              </span>
            ) : null}
            <div className="min-w-0">
              <p className="text-sm font-semibold text-[hsl(var(--foreground))]">{activeTab.label}</p>
              <p className="text-sm leading-relaxed text-[hsl(var(--muted-foreground))]">{activeTab.description}</p>
            </div>
          </div>
        ) : null}
      </div>
    </PanelContext.Provider>
  )
}

// Content of one tab. Unmounts when inactive and fades/rises in (200ms) when shown.
export function ChipTabPanel({ value, active, children, className }) {
  const { baseId } = useContext(PanelContext)
  const entered = useEntered(active ? value : null)
  if (!active) return null
  return (
    <div
      role="tabpanel"
      id={`${baseId}-panel-${value}`}
      aria-labelledby={`${baseId}-tab-${value}`}
      className={cn(
        'transition duration-200 ease-out motion-reduce:transition-none',
        entered ? 'translate-y-0 opacity-100' : 'translate-y-1 opacity-0 motion-reduce:translate-y-0 motion-reduce:opacity-100',
        className,
      )}
    >
      {children}
    </div>
  )
}
