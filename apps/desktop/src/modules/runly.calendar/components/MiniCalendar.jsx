import { ChevronLeft, ChevronRight } from 'lucide-react'
import { useState, useEffect } from 'react'

const DAYS = ['D', 'L', 'M', 'M', 'J', 'V', 'S']
const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function buildCalendarDays(year, month) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const prevDays = new Date(year, month, 0).getDate()
  const cells = []
  for (let i = firstDay - 1; i >= 0; i--) cells.push({ day: prevDays - i, current: false })
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, current: true })
  const remaining = 42 - cells.length
  for (let d = 1; d <= remaining; d++) cells.push({ day: d, current: false })
  return cells
}

export default function MiniCalendar({ selectedDate, onSelectDate }) {
  const sel = selectedDate ? new Date(selectedDate + 'T12:00:00') : new Date()
  const [viewYear, setViewYear] = useState(sel.getFullYear())
  const [viewMonth, setViewMonth] = useState(sel.getMonth())

  // Keep mini calendar in sync when the big calendar navigates to a different month
  useEffect(() => {
    if (!selectedDate) return
    const d = new Date(selectedDate + 'T12:00:00')
    if (d.getFullYear() !== viewYear || d.getMonth() !== viewMonth) {
      setViewYear(d.getFullYear())
      setViewMonth(d.getMonth())
    }
  }, [selectedDate])

  const today = new Date()
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`

  const cells = buildCalendarDays(viewYear, viewMonth)

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  function handleSelect(cell) {
    if (!cell.current) return
    const ds = `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(cell.day).padStart(2,'0')}`
    onSelectDate?.(ds)
  }

  return (
    <div className="select-none px-2 pb-2">
      <div className="flex items-center justify-between mb-2 px-1">
        <button type="button" onClick={prevMonth} className="p-1 rounded hover:bg-[hsl(var(--muted))]">
          <ChevronLeft size={14} />
        </button>
        <span className="text-xs font-semibold text-[hsl(var(--foreground))]">
          {MONTHS[viewMonth]} {viewYear}
        </span>
        <button type="button" onClick={nextMonth} className="p-1 rounded hover:bg-[hsl(var(--muted))]">
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-y-0.5">
        {DAYS.map((d, i) => (
          <div key={i} className="text-center text-[10px] text-[hsl(var(--muted-foreground))] font-medium py-0.5">{d}</div>
        ))}
        {cells.map((cell, i) => {
          const ds = cell.current
            ? `${viewYear}-${String(viewMonth + 1).padStart(2,'0')}-${String(cell.day).padStart(2,'0')}`
            : null
          const isSelected = ds === selectedDate
          const isToday = ds === todayStr
          return (
            <button
              key={i}
              type="button"
              onClick={() => handleSelect(cell)}
              className={[
                'text-[11px] w-6 h-6 mx-auto rounded-full flex items-center justify-center transition-colors',
                !cell.current && 'text-[hsl(var(--muted-foreground))] opacity-40 cursor-default',
                cell.current && 'hover:bg-[hsl(var(--muted))] cursor-pointer',
                isSelected && 'bg-violet-600 text-white hover:bg-violet-700',
                isToday && !isSelected && 'text-violet-600 font-bold',
              ].filter(Boolean).join(' ')}
            >
              {cell.day}
            </button>
          )
        })}
      </div>
    </div>
  )
}
