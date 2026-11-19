import { toLocalIso } from '../../../lib/localDate.js';
import { useState, useEffect, useRef, useCallback } from "react";
import { useCalendarStore } from "../stores/useCalendarStore";
import { useYearEvents } from "../hooks/useCalendarData";
import EventChip, { eventColors } from "./EventChip";

const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const WEEKDAYS_NARROW = ["D", "L", "M", "X", "J", "V", "S"];

const SLIDE_CSS = `
  @keyframes cal-slide-in-up {
    from { transform: translateY(100%); }
    to   { transform: translateY(0%); }
  }
  @keyframes cal-slide-out-up {
    from { transform: translateY(0%); }
    to   { transform: translateY(-100%); }
  }
  @keyframes cal-slide-in-down {
    from { transform: translateY(-100%); }
    to   { transform: translateY(0%); }
  }
  @keyframes cal-slide-out-down {
    from { transform: translateY(0%); }
    to   { transform: translateY(100%); }
  }
`;

const ANIM_DURATION = 320;
const SWIPE_THRESHOLD = 50; // px
const WHEEL_THRESHOLD = 60; // deltaY px accumulated
const WHEEL_COOLDOWN = 600; // ms between wheel navigations

function buildMonthGrid(year, month) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = firstDay - 1; i >= 0; i--)
    cells.push({
      date: new Date(year, month - 1, new Date(year, month, 0).getDate() - i),
      current: false,
    });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ date: new Date(year, month, d), current: true });
  let extra = 1;
  while (cells.length < 42)
    cells.push({ date: new Date(year, month + 1, extra++), current: false });
  return cells;
}

function dateKey(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// All-day events are stored as UTC midnight — use UTC date parts to avoid local-tz shift
function dateKeyUTC(d) {
  const dt = new Date(d);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, "0")}-${String(dt.getUTCDate()).padStart(2, "0")}`;
}

// Per-date map of events that are NOT multi-day allDay spans
function groupSingleDayEvents(events) {
  const map = {};
  for (const ev of events) {
    if (ev.allDay && ev.endAt) {
      const sk = dateKeyUTC(ev.startAt);
      const ek = dateKeyUTC(ev.endAt);
      if (sk !== ek) continue; // multi-day span — rendered as bar, not chip
    }
    const key = ev.allDay
      ? dateKeyUTC(ev.startAt)
      : dateKey(new Date(ev.startAt));
    if (!map[key]) map[key] = [];
    map[key].push(ev);
  }
  return map;
}

// Greedy lane assignment so spanning bars in the same row don't overlap vertically
function assignLanes(spans) {
  const result = [];
  const laneEnd = [];
  for (const s of spans) {
    let lane = laneEnd.findIndex((end) => end < s.colStart);
    if (lane === -1) {
      lane = laneEnd.length;
      laneEnd.push(s.colEnd);
    } else laneEnd[lane] = s.colEnd;
    result.push({ ...s, lane });
  }
  return result;
}

const SPAN_H = 20; // px — height of one spanning-bar slot
const DATE_ROW_H = 24; // px — height of the day-number row

// One week row: renders spanning bars + per-cell single-day chips
function WeekRow({
  cells,
  events,
  singleByDate,
  selectedDate,
  todayKey,
  onSelectDate,
  onNewEvent,
  onEventClick,
}) {
  const rowStartKey = dateKey(cells[0].date);
  const rowEndKey = dateKey(cells[6].date);

  // Collect multi-day allDay spans that overlap this row
  const rawSpans = [];
  const seen = new Set();
  for (const ev of events) {
    if (!ev.allDay || seen.has(ev.id)) continue;
    const sk = dateKeyUTC(ev.startAt);
    const ek = ev.endAt ? dateKeyUTC(ev.endAt) : sk;
    if (sk === ek) continue; // single-day allDay — not a span
    if (ek < rowStartKey || sk > rowEndKey) continue; // outside this row entirely
    const clampSk = sk < rowStartKey ? rowStartKey : sk;
    const clampEk = ek > rowEndKey ? rowEndKey : ek;
    const colStart = cells.findIndex((c) => dateKey(c.date) === clampSk);
    const colEnd = cells.findIndex((c) => dateKey(c.date) === clampEk);
    if (colStart === -1 || colEnd === -1 || colEnd < colStart) continue;
    rawSpans.push({
      ev,
      colStart,
      colEnd,
      startsHere: sk >= rowStartKey,
      endsHere: ek <= rowEndKey,
    });
    seen.add(ev.id);
  }

  rawSpans.sort(
    (a, b) =>
      a.colStart - b.colStart ||
      b.colEnd - b.colStart - (a.colEnd - a.colStart),
  );
  const laned = assignLanes(rawSpans);
  const spanIds = new Set(rawSpans.map((s) => s.ev.id));
  // Lanes used per column, so single-day chips only drop below bars on days that have bars
  const colLanes = cells.map((_, ci) =>
    laned.reduce(
      (m, s) => (s.colStart <= ci && ci <= s.colEnd ? Math.max(m, s.lane + 1) : m),
      0,
    ),
  );

  return (
    <div className="relative flex-1 grid grid-cols-7 min-h-0 border-b border-[hsl(var(--border))] last:border-b-0">
      {/* Full-height day cells: number + single-day chips */}
      {cells.map((cell, ci) => {
        const k = dateKey(cell.date);
        const dayEvents = (singleByDate[k] ?? []).filter(
          (ev) => !spanIds.has(ev.id),
        );
        return (
          <div
            key={ci}
            onClick={() => onSelectDate(k)}
            onDoubleClick={(e) => {
              e.stopPropagation();
              onNewEvent(k);
            }}
            className={[
              "flex flex-col min-h-0 border-r border-[hsl(var(--border))] last:border-r-0 cursor-pointer overflow-hidden select-none",
              "hover:bg-[hsl(var(--muted))]/30 transition-colors",
              !cell.current && "bg-[hsl(var(--muted))]/20",
              k === selectedDate && "ring-1 ring-inset ring-violet-500",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <div
              className="flex shrink-0 justify-end pr-1 pt-0.5"
              style={{ height: `${DATE_ROW_H}px` }}
            >
              <span
                className={[
                  "text-xs w-6 h-6 flex items-center justify-center rounded-full font-medium",
                  k === todayKey ? "bg-violet-600 text-white" : "",
                  !cell.current
                    ? "text-[hsl(var(--muted-foreground))] opacity-50"
                    : "text-[hsl(var(--foreground))]",
                ].join(" ")}
              >
                {cell.date.getDate()}
              </span>
            </div>
            <div
              className="space-y-0.5 overflow-hidden px-1 pb-1 pt-0.5"
              style={{ marginTop: `${colLanes[ci] * SPAN_H}px` }}
            >
              {dayEvents.slice(0, 3).map((ev) => (
                <EventChip
                  key={ev.id}
                  event={ev}
                  onClick={onEventClick}
                  compact
                />
              ))}
              {dayEvents.length > 3 && (
                <div className="text-[10px] text-[hsl(var(--muted-foreground))] pl-1">
                  +{dayEvents.length - 3} más
                </div>
              )}
            </div>
          </div>
        );
      })}

      {/* Spanning bars overlaid on the cells */}
      {laned.map(({ ev, colStart, colEnd, lane, startsHere, endsHere }) => {
          const { bg, accent } = eventColors(ev);
          const lPct = (colStart / 7) * 100;
          const wPct = ((colEnd - colStart + 1) / 7) * 100;
          const rL = startsHere ? "4px" : "0";
          const rR = endsHere ? "4px" : "0";
          const lInset = startsHere ? 3 : 0;
          const rInset = endsHere ? 3 : 0;
          return (
            <button
              key={ev.id}
              type="button"
              title={ev.title}
              onClick={(e) => {
                e.stopPropagation();
                onEventClick(ev);
              }}
              className="absolute text-white text-[11px] font-medium px-1.5 truncate hover:brightness-90 transition-all"
              style={{
                left: `calc(${lPct}% + ${lInset}px)`,
                width: `calc(${wPct}% - ${lInset + rInset + 2}px)`,
                top: `${DATE_ROW_H + lane * SPAN_H + 2}px`,
                height: `${SPAN_H - 4}px`,
                lineHeight: `${SPAN_H - 4}px`,
                backgroundColor: bg,
                boxShadow: accent && startsHere ? `inset 4px 0 0 ${accent}` : undefined,
                borderTopLeftRadius: rL,
                borderBottomLeftRadius: rL,
                borderTopRightRadius: rR,
                borderBottomRightRadius: rR,
              }}
            >
              {ev.title}
            </button>
          );
        })}
    </div>
  );
}

// Pure grid — receives events as prop, no internal fetch
function MonthGrid({
  year,
  month,
  events,
  singleByDate,
  selectedDate,
  onSelectDate,
  onEventClick,
  onNewEvent,
}) {
  const cells = buildMonthGrid(year, month);
  const rows = [];
  for (let i = 0; i < 42; i += 7) rows.push(cells.slice(i, i + 7));
  const todayKey = dateKey(new Date());

  return (
    <div className="flex flex-col h-full">
      {rows.map((row, ri) => (
        <WeekRow
          key={ri}
          cells={row}
          events={events}
          singleByDate={singleByDate}
          selectedDate={selectedDate}
          todayKey={todayKey}
          onSelectDate={onSelectDate}
          onNewEvent={onNewEvent}
          onEventClick={onEventClick}
        />
      ))}
    </div>
  );
}

export default function MonthView({ onEventClick, onDayClick, onNewEvent }) {
  const {
    selectedDate,
    setSelectedDate,
    activeCalendarIds,
    navigatePrev,
    navigateNext,
  } = useCalendarStore();
  const ref = selectedDate || toLocalIso();
  const d = new Date(ref + "T12:00:00");
  const targetYear = d.getFullYear();
  const targetMonth = d.getMonth();

  const [current, setCurrent] = useState({
    year: targetYear,
    month: targetMonth,
  });
  const [prev, setPrev] = useState(null);
  const [direction, setDirection] = useState("next");
  const [animating, setAnimating] = useState(false);

  // ── Month transition ───────────────────────────────────────────────────────
  useEffect(() => {
    if (targetYear === current.year && targetMonth === current.month) return;

    const isNext =
      targetYear > current.year ||
      (targetYear === current.year && targetMonth > current.month);

    setPrev({ ...current });
    setDirection(isNext ? "next" : "prev");
    setCurrent({ year: targetYear, month: targetMonth });
    setAnimating(true);

    const t = setTimeout(() => {
      setPrev(null);
      setAnimating(false);
    }, ANIM_DURATION);
    return () => clearTimeout(t);
  }, [targetYear, targetMonth]);

  // ── Year-level event cache — one fetch per year, stable key, instant month nav
  // Preload adjacent years at year boundaries so cross-year navigation is seamless
  const needsPrevYear = current.month === 0 || prev?.year === current.year - 1;
  const needsNextYear = current.month === 11 || prev?.year === current.year + 1;

  const { data: curYearEvents = [] } = useYearEvents(
    current.year,
    activeCalendarIds,
  );
  const { data: prevYearEvents = [] } = useYearEvents(
    current.year - 1,
    activeCalendarIds,
    needsPrevYear,
  );
  const { data: nextYearEvents = [] } = useYearEvents(
    current.year + 1,
    activeCalendarIds,
    needsNextYear,
  );

  function eventsForYear(year) {
    if (year === current.year) return curYearEvents;
    if (year === current.year - 1) return prevYearEvents;
    if (year === current.year + 1) return nextYearEvents;
    return [];
  }

  const singleByDate = groupSingleDayEvents(curYearEvents);
  const prevSingleByDate = groupSingleDayEvents(
    prev ? eventsForYear(prev.year) : [],
  );

  // ── Handlers ───────────────────────────────────────────────────────────────
  function handleSelectDate(key) {
    setSelectedDate(key);
    onDayClick?.(key);
  }

  function handleNewEvent(dateStr) {
    onNewEvent?.(dateStr);
  }

  // ── Swipe gestures (mobile) ────────────────────────────────────────────────
  const touchStartY = useRef(null);
  const touchStartX = useRef(null);

  function onTouchStart(e) {
    touchStartY.current = e.touches[0].clientY;
    touchStartX.current = e.touches[0].clientX;
  }

  function onTouchEnd(e) {
    if (touchStartY.current === null) return;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    touchStartY.current = null;
    touchStartX.current = null;
    // Only trigger if vertical dominates and exceeds threshold
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(dy) > SWIPE_THRESHOLD) {
      if (dy < 0) navigateNext();
      else navigatePrev();
    }
  }

  // ── Wheel / trackpad (desktop) ─────────────────────────────────────────────
  const wheelAccum = useRef(0);
  const wheelLast = useRef(0);
  const gridRef = useRef(null);

  useEffect(() => {
    const el = gridRef.current;
    if (!el) return;

    function onWheel(e) {
      // Only capture vertical scrolls; ignore horizontal (trackpad horizontal pan)
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
      e.preventDefault();

      const now = Date.now();
      if (now - wheelLast.current < WHEEL_COOLDOWN) return;

      wheelAccum.current += e.deltaY;
      if (Math.abs(wheelAccum.current) >= WHEEL_THRESHOLD) {
        if (wheelAccum.current > 0) navigateNext();
        else navigatePrev();
        wheelAccum.current = 0;
        wheelLast.current = now;
      }
    }

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [navigateNext, navigatePrev]);

  // ── Render ─────────────────────────────────────────────────────────────────
  const inAnim = direction === "next" ? "cal-slide-in-up" : "cal-slide-in-down";
  const outAnim =
    direction === "next" ? "cal-slide-out-up" : "cal-slide-out-down";

  const gridCommonProps = {
    selectedDate,
    onSelectDate: handleSelectDate,
    onEventClick,
    onNewEvent: handleNewEvent,
  };

  return (
    <div
      className="flex-1 flex flex-col overflow-hidden"
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <style>{SLIDE_CSS}</style>

      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] shrink-0">
        {WEEKDAYS.map((wd, i) => (
          <div
            key={wd}
            className="py-2 text-center text-xs font-semibold text-[hsl(var(--muted-foreground))] border-r border-[hsl(var(--border))] last:border-r-0"
          >
            <span className="hidden sm:inline">{wd}</span>
            <span className="sm:hidden">{WEEKDAYS_NARROW[i]}</span>
          </div>
        ))}
      </div>

      {/* Grid area */}
      <div ref={gridRef} className="flex-1 relative overflow-hidden">
        {/* Outgoing grid */}
        {animating && prev && (
          <div
            className="absolute inset-0 flex flex-col"
            style={{
              animation: `${outAnim} ${ANIM_DURATION}ms cubic-bezier(0.4,0,0.2,1) forwards`,
            }}
          >
            <MonthGrid
              year={prev.year}
              month={prev.month}
              events={eventsForYear(prev.year)}
              singleByDate={prevSingleByDate}
              {...gridCommonProps}
            />
          </div>
        )}

        {/* Incoming / current grid */}
        <div
          className="absolute inset-0 flex flex-col"
          style={
            animating
              ? {
                  animation: `${inAnim} ${ANIM_DURATION}ms cubic-bezier(0.4,0,0.2,1) forwards`,
                }
              : undefined
          }
        >
          <MonthGrid
            year={current.year}
            month={current.month}
            events={curYearEvents}
            singleByDate={singleByDate}
            {...gridCommonProps}
          />
        </div>
      </div>
    </div>
  );
}
