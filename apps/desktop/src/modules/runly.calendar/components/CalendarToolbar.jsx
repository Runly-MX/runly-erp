import { ChevronLeft, ChevronRight, ChevronUp, ChevronDown, PanelLeftOpen, Plus } from 'lucide-react'
import { useCalendarStore } from '../stores/useCalendarStore'

const VIEWS = [
  { key: 'day',    label: 'Dia' },
  { key: 'week',   label: 'Semana' },
  { key: 'month',  label: 'Mes' },
  { key: 'agenda', label: 'Agenda' },
]

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const SHORT = ['ene','feb','mar','abr','may','jun','jul','ago','sep','oct','nov','dic']

// Phone title: two lines (range + month/year) so it never truncates.
function phoneTitle(view, dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  if (view === 'day') {
    return { main: d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric' }), sub: `${MONTHS[d.getMonth()]} ${d.getFullYear()}` }
  }
  if (view === 'week' || view === 'agenda') {
    const start = new Date(d); start.setDate(d.getDate() - d.getDay())
    const end = new Date(start); end.setDate(start.getDate() + 6)
    const main = start.getMonth() === end.getMonth()
      ? `${start.getDate()} – ${end.getDate()}`
      : `${start.getDate()} ${SHORT[start.getMonth()]} – ${end.getDate()} ${SHORT[end.getMonth()]}`
    return { main, sub: `${MONTHS[end.getMonth()]} ${end.getFullYear()}` }
  }
  return { main: MONTHS[d.getMonth()], sub: String(d.getFullYear()) }
}

function formatTitle(view, dateStr) {
  const d = new Date(dateStr + 'T12:00:00')
  if (view === 'day') {
    return d.toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }
  if (view === 'week') {
    const start = new Date(d); start.setDate(d.getDate() - d.getDay())
    const end = new Date(start); end.setDate(start.getDate() + 6)
    if (start.getMonth() === end.getMonth()) {
      return `${start.getDate()} – ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`
    }
    return `${start.getDate()} ${MONTHS[start.getMonth()]} – ${end.getDate()} ${MONTHS[end.getMonth()]} ${end.getFullYear()}`
  }
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`
}

const phoneIconButton = 'flex h-10 shrink-0 items-center justify-center rounded-md text-[hsl(var(--muted-foreground))] transition-colors active:bg-[hsl(var(--muted))]'

export default function CalendarToolbar({ onNewEvent, onToggleSidebar }) {
  const { activeView, selectedDate, setActiveView, navigatePrev, navigateNext, navigateToday } = useCalendarStore()
  const vertical = activeView === 'month'
  const title = phoneTitle(activeView, selectedDate)

  return (
    <div className="bg-[hsl(var(--surface-1))]">
      {/* Phone: navigation + actions, then a full-width view switcher. */}
      <div className="sm:hidden space-y-2 px-2 py-2">
        <div className="flex items-center gap-0.5">
          <button type="button" onClick={onToggleSidebar} aria-label="Mis calendarios" className={`${phoneIconButton} w-10`}>
            <PanelLeftOpen size={18} aria-hidden />
          </button>
          <button type="button" onClick={navigatePrev} aria-label="Anterior" className={`${phoneIconButton} w-9`}>
            {vertical ? <ChevronUp size={18} aria-hidden /> : <ChevronLeft size={18} aria-hidden />}
          </button>
          <div className="min-w-0 flex-1 px-1 text-center leading-tight">
            <h2 className="truncate text-base font-semibold capitalize text-[hsl(var(--foreground))]">{title.main}</h2>
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-violet-400">{title.sub}</p>
          </div>
          <button type="button" onClick={navigateNext} aria-label="Siguiente" className={`${phoneIconButton} w-9`}>
            {vertical ? <ChevronDown size={18} aria-hidden /> : <ChevronRight size={18} aria-hidden />}
          </button>
          <button type="button" onClick={navigateToday} className="ml-1 h-10 shrink-0 rounded-md border border-[hsl(var(--border))] px-3 text-xs font-semibold text-[hsl(var(--foreground))] transition-colors active:bg-[hsl(var(--muted))]">
            Hoy
          </button>
          <button type="button" onClick={onNewEvent} aria-label="Nuevo evento" className="ml-1.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-linear-to-br from-violet-500 to-fuchsia-500 text-white shadow-md shadow-violet-500/30 transition-transform active:scale-95">
            <Plus size={19} aria-hidden />
          </button>
        </div>
        <div role="tablist" aria-label="Vista" className="grid grid-cols-4 gap-1 rounded-md bg-[hsl(var(--muted))]/60 p-1">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              role="tab"
              aria-selected={activeView === v.key}
              onClick={() => setActiveView(v.key)}
              className={[
                'h-9 rounded-sm text-xs font-semibold transition-colors',
                activeView === v.key
                  ? 'bg-violet-600 text-white shadow-sm shadow-violet-600/30'
                  : 'text-[hsl(var(--muted-foreground))] active:bg-[hsl(var(--background))]/60',
              ].join(' ')}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tablet / desktop: single row. */}
      <div className="hidden sm:flex items-center gap-1.5 px-3 py-2">
        <div className="flex items-center gap-0.5 shrink-0">
          <button
            onClick={navigatePrev}
            aria-label="Anterior"
            className="p-1.5 rounded hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
          >
            {vertical ? <ChevronUp size={16} /> : <ChevronLeft size={16} />}
          </button>
          <button
            onClick={navigateNext}
            aria-label="Siguiente"
            className="p-1.5 rounded hover:bg-[hsl(var(--muted))] text-[hsl(var(--muted-foreground))]"
          >
            {vertical ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </button>
        </div>

        <h2 className="text-sm font-semibold text-[hsl(var(--foreground))] capitalize truncate min-w-40">
          {formatTitle(activeView, selectedDate)}
        </h2>

        <button
          onClick={navigateToday}
          className="text-xs px-2.5 py-1 rounded border border-[hsl(var(--border))] hover:bg-[hsl(var(--muted))] text-[hsl(var(--foreground))] shrink-0"
        >
          Hoy
        </button>

        <div className="flex-1" />

        <div className="flex items-center rounded-lg border border-[hsl(var(--border))] overflow-hidden shrink-0">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              onClick={() => setActiveView(v.key)}
              className={[
                'px-3 py-1 text-xs font-medium transition-colors',
                activeView === v.key
                  ? 'bg-violet-600 text-white'
                  : 'text-[hsl(var(--muted-foreground))] hover:bg-[hsl(var(--muted))]',
              ].join(' ')}
            >
              {v.label}
            </button>
          ))}
        </div>

        <button
          onClick={onNewEvent}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium shrink-0"
        >
          <Plus size={14} />
          <span>Nuevo</span>
        </button>
      </div>
    </div>
  )
}
