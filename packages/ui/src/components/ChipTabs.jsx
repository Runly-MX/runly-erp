import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, CircleHelp } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from './Popover.jsx'
import { cn } from '../lib/utils.js'

// Colored chip tabs with a sliding indicator and a description popover.
// Controlled: pass `value` / `onChange`. Pair with <ChipTabPanel> for content.

const TONES = {
  brand: { solid: 'bg-(--brand-primary)', shadow: 'shadow-black/15', banner: 'border-(--brand-primary)/25 bg-(--brand-soft)', icon: 'bg-(--brand-primary) text-(--brand-primary-foreground)', focus: 'focus-visible:ring-(--brand-primary)' },
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

export function ChipTabs({ tabs = [], value, onChange, tone = 'brand', ariaLabel, showDescription = true, descriptionMode = 'popover', className }) {
  const baseId = useId()
  const palette = TONES[tone] ?? TONES.brand
  const listRef = useRef(null)
  const tabRefs = useRef(new Map())
  const scrollerRef = useRef(null)
  const [indicator, setIndicator] = useState(null) // { x, w }
  const [edges, setEdges] = useState({ left: false, right: false }) // more tabs hidden on that side
  // Phones: up to 4 tabs fill the width as equal columns (icon over label);
  // more tabs keep the scrollable strip with edge fades and arrows.
  const compactGrid = tabs.length > 0 && tabs.length <= 4
  // 5+ tabs with icons: on phones inactive tabs show only their icon (label stays
  // for screen readers) and the active one shows icon + label, so they still fit.
  const iconCollapse = !compactGrid && tabs.length > 0 && tabs.every((t) => t.icon)
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

  // Which sides of the strip have hidden tabs (drives the fades and arrows).
  const updateEdges = useCallback(() => {
    const el = scrollerRef.current
    if (!el) return
    const left = el.scrollLeft > 2
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 2
    setEdges((prev) => (prev.left === left && prev.right === right ? prev : { left, right }))
  }, [])

  useEffect(() => {
    const el = scrollerRef.current
    if (!el) return undefined
    updateEdges()
    el.addEventListener('scroll', updateEdges, { passive: true })
    window.addEventListener('resize', updateEdges)
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(updateEdges) : null
    observer?.observe(el)
    return () => { el.removeEventListener('scroll', updateEdges); window.removeEventListener('resize', updateEdges); observer?.disconnect() }
  }, [updateEdges, tabs.length])

  // Keep the active chip visible (centered) in the horizontally scrollable strip.
  useEffect(() => {
    const node = tabRefs.current.get(activeValue)
    const el = scrollerRef.current
    if (!node || !el || el.scrollWidth <= el.clientWidth) return
    const target = node.offsetLeft - (el.clientWidth - node.offsetWidth) / 2
    el.scrollTo?.({ left: Math.max(0, target), behavior: 'smooth' })
  }, [activeValue])

  const scrollBy = (direction) => {
    const el = scrollerRef.current
    el?.scrollBy?.({ left: direction * Math.max(120, el.clientWidth * 0.6), behavior: 'smooth' })
  }

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
  // showDescription={false} (legacy) means no description at all.
  const mode = showDescription === false ? 'none' : descriptionMode
  const hasDescription = Boolean(activeTab?.description)

  return (
    <PanelContext.Provider value={{ baseId }}>
      <div className={cn('min-w-0', className)}>
        <div className="flex items-center gap-1">
        <div className={cn('relative min-w-0', compactGrid ? 'max-sm:flex-1' : 'flex-1 sm:flex-initial')}>
        {edges.left ? (
          <>
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-1 left-0 z-20 w-10 bg-linear-to-r from-[hsl(var(--background))] to-transparent" />
            <button type="button" tabIndex={-1} aria-label="Ver pestañas anteriores" onClick={() => scrollBy(-1)} className="absolute left-0 top-1/2 z-30 flex h-8 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        ) : null}
        {edges.right ? (
          <>
            <span aria-hidden="true" className="pointer-events-none absolute inset-y-1 right-0 z-20 w-10 bg-linear-to-l from-[hsl(var(--background))] to-transparent" />
            <button type="button" tabIndex={-1} aria-label="Ver más pestañas" onClick={() => scrollBy(1)} className="absolute right-0 top-1/2 z-30 flex h-8 w-6 -translate-y-1/2 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] hover:text-[hsl(var(--foreground))]">
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
          </>
        ) : null}
        <div ref={scrollerRef} className="-mx-1 min-w-0 overflow-x-auto scroll-smooth px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div
            ref={listRef}
            role="tablist"
            aria-label={ariaLabel}
            onKeyDown={onKeyDown}
            className={cn(
              'relative inline-flex min-w-max gap-1 rounded-2xl border border-[hsl(var(--border))] bg-[hsl(var(--muted))]/60 p-1',
              compactGrid && 'max-sm:flex max-sm:w-full max-sm:min-w-0',
            )}
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
                    // Phone grid: equal columns, icon over a small label that may truncate.
                    compactGrid && 'max-sm:min-w-0 max-sm:flex-1 max-sm:flex-col max-sm:justify-center max-sm:gap-0.5 max-sm:px-1.5 max-sm:py-1.5 max-sm:text-[11px] max-sm:leading-tight',
                    iconCollapse && (selected ? 'max-sm:px-3' : 'max-sm:min-w-11 max-sm:justify-center max-sm:px-2.5'),
                    palette.focus,
                    selected
                      ? cn('text-white', !indicator && cn(palette.solid, 'shadow-md', palette.shadow))
                      : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--background))]/70 hover:text-[hsl(var(--foreground))] active:scale-[0.98]',
                  )}
                >
                  {Icon ? <Icon className="h-4 w-4 shrink-0" aria-hidden="true" /> : null}
                  <span className={cn(compactGrid && 'max-sm:block max-sm:max-w-full max-sm:truncate', iconCollapse && !selected && 'max-sm:sr-only')}>{tab.label}</span>
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
        </div>
        {mode === 'popover' && hasDescription ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Qué es esto"
                title="Qué es esto"
                className={cn('inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-[hsl(var(--muted-foreground))] outline-none transition-colors hover:bg-[hsl(var(--muted))] hover:text-[hsl(var(--foreground))] focus-visible:ring-2 focus-visible:ring-offset-1 sm:h-9 sm:w-9', palette.focus)}
              >
                <CircleHelp className="h-5 w-5" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-96 max-w-[calc(100vw-2rem)] p-4">
              <div className="flex items-start gap-3">
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
            </PopoverContent>
          </Popover>
        ) : null}
        </div>

        {mode === 'banner' && hasDescription ? (
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
