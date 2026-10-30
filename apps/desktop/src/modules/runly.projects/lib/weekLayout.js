// Pure helpers for the "Semana" view (unit tested). Works in the same whole UTC day
// numbers as the Gantt (see ganttLayout.js), so a task never shifts with the time zone.
import { dayNumber, dayText, taskSpan } from "./ganttLayout.js";

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
export const MONTH_NAMES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

const dateOf = (day) => new Date(day * DAY_MS);

// Day 0 (1970-01-01) was a Thursday; weeks start on Monday.
export const weekdayIndex = (day) => (((day + 4) % 7) + 7) % 7; // 0 = Sunday
export const weekStart = (day) => day - ((weekdayIndex(day) + 6) % 7);
export const weekDays = (start) => Array.from({ length: 7 }, (_, i) => start + i);

export function dayLabel(day) {
  const date = dateOf(day);
  return { weekday: WEEKDAYS[date.getUTCDay()], number: date.getUTCDate(), month: date.getUTCMonth(), year: date.getUTCFullYear() };
}

// "27 oct – 2 nov 2026" (month and year only where they change).
export function weekRangeLabel(start) {
  const a = dateOf(start);
  const b = dateOf(start + 6);
  const left = `${a.getUTCDate()}${a.getUTCMonth() === b.getUTCMonth() ? "" : ` ${MONTHS[a.getUTCMonth()]}`}${a.getUTCFullYear() === b.getUTCFullYear() ? "" : ` ${a.getUTCFullYear()}`}`;
  return `${left} – ${b.getUTCDate()} ${MONTHS[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
}

const byOrder = (a, b) =>
  Number(Boolean(a.status?.isDone)) - Number(Boolean(b.status?.isDone)) ||
  (taskSpan(a)?.start ?? 0) - (taskSpan(b)?.start ?? 0) ||
  String(a.title).localeCompare(String(b.title));

// Tasks whose date span covers `day` (open ones first).
export const tasksOnDay = (tasks, day) =>
  tasks.filter((task) => { const span = taskSpan(task); return span && span.start <= day && day <= span.end; }).sort(byOrder);

// Open tasks that need a date: overdue (ended before today) and undated.
export function pendingTasks(tasks, today) {
  const open = tasks.filter((task) => !task.status?.isDone);
  return {
    overdue: open.filter((task) => { const span = taskSpan(task); return span && span.end < today; }).sort(byOrder),
    undated: open.filter((task) => !taskSpan(task)),
  };
}

// Completion of the tasks that touch the week.
export function weekProgress(tasks, start) {
  const end = start + 6;
  const inWeek = tasks.filter((task) => { const span = taskSpan(task); return span && span.start <= end && span.end >= start; });
  const done = inWeek.filter((task) => task.status?.isDone).length;
  const dueThisWeek = inWeek.filter((task) => { const span = taskSpan(task); return span.end >= start && span.end <= end && !task.status?.isDone; }).length;
  return { total: inWeek.length, done, dueThisWeek, percent: inWeek.length ? Math.round((done / inWeek.length) * 100) : 0 };
}

// Monday-first 6x7 grid of day numbers for a month (month 0-11).
export function monthGrid(year, month) {
  const first = dayNumber(`${year}-${String(month + 1).padStart(2, "0")}-01`);
  const start = weekStart(first);
  return Array.from({ length: 42 }, (_, i) => start + i);
}

// The dates a task gets when moved by `delta` days (or first scheduled on `day`).
// Only the dates the task already has move; an undated task gets both.
export function movedDates(task, delta, day) {
  const span = taskSpan(task);
  if (!span) return { startDate: dayText(day), dueDate: dayText(day) };
  return {
    startDate: task.startDate ? dayText(dayNumber(task.startDate) + delta) : undefined,
    dueDate: task.dueDate ? dayText(dayNumber(task.dueDate) + delta) : undefined,
  };
}
