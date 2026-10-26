import { useLayoutEffect, useRef, useState } from 'react'
import { Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, cn } from '@runly/ui'
import { FolderOpen, House, LayoutTemplate, Plus, Ruler } from 'lucide-react'
import { STUDIO_FORMATS, sizeLabel } from '../../lib/formats.js'

export const HOME_VIEWS = [
  { value: 'home', label: 'Inicio', icon: House },
  { value: 'designs', label: 'Mis diseños', icon: FolderOpen },
  { value: 'templates', label: 'Plantillas', icon: LayoutTemplate },
]

function CreateMenu({ creating, onCreate, onCustom }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button disabled={Boolean(creating)} className="h-11 w-full justify-center gap-2 bg-gradient-to-r from-fuchsia-600 to-violet-600 text-white shadow-md shadow-fuchsia-600/20 hover:from-fuchsia-500 hover:to-violet-500">
          <Plus />Crear diseño
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-64">
        <DropdownMenuLabel>Elige un formato</DropdownMenuLabel>
        {STUDIO_FORMATS.slice(0, 6).map(format => {
          const Icon = format.icon
          return (
            <DropdownMenuItem key={format.key} onSelect={() => onCreate(format)} className="gap-2.5">
              <span className={cn('flex h-7 w-7 items-center justify-center rounded-md bg-gradient-to-br text-white', format.tone)}><Icon className="h-3.5 w-3.5" /></span>
              <span className="min-w-0 flex-1"><span className="block text-sm">{format.label}</span><span className="block text-xs tabular-nums text-[hsl(var(--muted-foreground))]">{sizeLabel(format)}</span></span>
            </DropdownMenuItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onCustom} className="gap-2.5"><Ruler className="h-4 w-4 text-[hsl(var(--muted-foreground))]" />Tamaño personalizado</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// Measures the active item inside `container` so a single indicator can slide
// between items (transform/size transition) instead of jumping.
function useIndicator(view) {
  const container = useRef(null), [box, setBox] = useState(null)
  useLayoutEffect(() => {
    const node = container.current
    if (!node) return undefined
    const measure = () => {
      const active = node.querySelector(`[data-view="${view}"]`)
      if (active && active.offsetWidth) setBox({ x: active.offsetLeft, y: active.offsetTop, width: active.offsetWidth, height: active.offsetHeight })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [view])
  return [container, box]
}

const SLIDE = 'pointer-events-none absolute left-0 top-0 transition-[transform,width,height,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none'

// Desktop (lg+): sticky side navigation with the create menu.
export function StudioHomeSidebar({ view, onView, creating, onCreate, onCustom }) {
  const [list, box] = useIndicator(view)
  return (
    <aside className="sticky top-6 hidden w-56 shrink-0 self-start lg:block">
      <CreateMenu creating={creating} onCreate={onCreate} onCustom={onCustom} />
      <nav aria-label="Secciones de Studio" ref={list} className="relative mt-5 space-y-1">
        <span aria-hidden className={cn(SLIDE, 'rounded-md bg-fuchsia-500/12', box ? 'opacity-100' : 'opacity-0')}
          style={box ? { transform: `translateY(${box.y}px)`, width: box.width, height: box.height } : undefined} />
        {HOME_VIEWS.map(item => {
          const Icon = item.icon, active = view === item.value
          return (
            <button key={item.value} type="button" data-view={item.value} aria-current={active ? 'page' : undefined} onClick={() => onView(item.value)}
              className={cn('relative flex h-11 w-full items-center gap-3 rounded-md px-3 text-sm font-medium transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))]',
                active ? 'text-fuchsia-700 dark:text-fuchsia-300' : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted)/0.6)] hover:text-[hsl(var(--foreground))]')}>
              <Icon className={cn('h-[18px] w-[18px] transition-transform duration-300', active && 'scale-110')} aria-hidden />{item.label}
            </button>
          )
        })}
      </nav>
    </aside>
  )
}

// Phones/tablets: sticky tab bar at the top of the scroll area.
export function StudioHomeTabs({ view, onView }) {
  const [list, box] = useIndicator(view)
  return (
    <nav aria-label="Secciones de Studio" className="sticky top-0 z-20 -mx-4 border-b border-[hsl(var(--border))] bg-[hsl(var(--background)/0.88)] px-2 backdrop-blur-md sm:-mx-6 lg:hidden">
      <div ref={list} className="relative mx-auto flex max-w-xl">
        {HOME_VIEWS.map(item => {
          const Icon = item.icon, active = view === item.value
          return (
            <button key={item.value} type="button" data-view={item.value} aria-current={active ? 'page' : undefined} onClick={() => onView(item.value)}
              className={cn('relative flex h-12 flex-1 items-center justify-center gap-2 text-sm font-medium transition-colors duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[hsl(var(--ring))]',
                active ? 'text-[hsl(var(--foreground))]' : 'text-[hsl(var(--muted-foreground))]')}>
              <Icon className={cn('h-4 w-4 transition-colors duration-300', active && 'text-fuchsia-600 dark:text-fuchsia-400')} aria-hidden />{item.label}
            </button>
          )
        })}
        <span aria-hidden className={cn(SLIDE, 'h-0.5 rounded-full bg-fuchsia-600', box ? 'opacity-100' : 'opacity-0')}
          style={box ? { transform: `translate(${box.x + 16}px, ${box.height - 2}px)`, width: Math.max(0, box.width - 32) } : undefined} />
      </div>
    </nav>
  )
}
