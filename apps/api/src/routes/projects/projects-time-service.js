// Time entries and the running timer of tasks. Spec
// docs/superpowers/specs/2026-10-26-projects-depth-design.md, section 2.
import { checkManualEntry, summarize, timerMinutes, TIMER_LIMIT_MINUTES } from './projects-time.js'

export class TimeServiceError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.name = 'TimeServiceError'
    this.status = status
  }
}

const SHOW = { id: true, taskId: true, userId: true, startedAt: true, minutes: true, note: true, source: true, createdAt: true }

export function createTimeService({ prisma, now = () => new Date() }) {
  // Closes the person's running timer (if any). Returns the closed entry or null.
  async function closeRunning(where) {
    const running = await prisma.taskTimeEntry.findFirst({ where: { ...where, minutes: null }, select: SHOW })
    if (!running) return null
    const { minutes, capped } = timerMinutes(running.startedAt, now())
    return prisma.taskTimeEntry.update({
      where: { id: running.id },
      data: { minutes, ...(capped ? { note: [running.note, 'Cerrado automáticamente a las 12 h: revisa el tiempo.'].filter(Boolean).join(' ') } : {}) },
      select: SHOW,
    })
  }

  async function addEntry({ companyId, taskId, userId, minutes, startedAt, note }) {
    const checked = checkManualEntry({ minutes, startedAt }, now())
    if (checked.error) throw new TimeServiceError(checked.error)
    return prisma.taskTimeEntry.create({
      data: { companyId, taskId, userId, startedAt: checked.startedAt, minutes: checked.minutes, note: note ? String(note).slice(0, 500) : null, source: 'manual' },
      select: SHOW,
    })
  }

  // One running timer per person: starting another stops the first and reports it.
  async function startTimer({ companyId, taskId, userId }) {
    const stopped = await closeRunning({ companyId, userId })
    const started = await prisma.taskTimeEntry.create({ data: { companyId, taskId, userId, startedAt: now(), minutes: null, source: 'timer' }, select: SHOW })
    return { started, stopped }
  }

  async function stopTimer({ companyId, userId }) {
    const stopped = await closeRunning({ companyId, userId })
    if (!stopped) throw new TimeServiceError('No tienes un cronómetro en marcha.', 404)
    return stopped
  }

  // The person's running timer, closing it first if it has been left on too long.
  async function running({ companyId, userId }) {
    const entry = await prisma.taskTimeEntry.findFirst({ where: { companyId, userId, minutes: null }, select: { ...SHOW, task: { select: { id: true, title: true, projectId: true } } } })
    if (!entry) return null
    if ((now().getTime() - new Date(entry.startedAt).getTime()) / 60_000 > TIMER_LIMIT_MINUTES) { await closeRunning({ companyId, userId }); return null }
    return entry
  }

  // Worker pass: closes timers left running for more than 12 hours.
  async function closeStaleTimers() {
    const cutoff = new Date(now().getTime() - TIMER_LIMIT_MINUTES * 60_000)
    const stale = await prisma.taskTimeEntry.findMany({ where: { minutes: null, startedAt: { lt: cutoff } }, select: { companyId: true, userId: true } })
    for (const { companyId, userId } of stale) await closeRunning({ companyId, userId })
    return { closed: stale.length }
  }

  // `canSeeAll`: project owners see everyone's entries; everybody else only their own.
  async function listEntries({ companyId, taskId, userId, canSeeAll }) {
    return prisma.taskTimeEntry.findMany({
      where: { companyId, taskId, ...(canSeeAll ? {} : { userId }) },
      orderBy: { startedAt: 'desc' },
      take: 200,
      select: SHOW,
    })
  }

  async function deleteEntry({ companyId, entryId, taskId, userId, canSeeAll }) {
    const entry = await prisma.taskTimeEntry.findFirst({ where: { id: entryId, companyId, taskId }, select: { id: true, userId: true } })
    if (!entry || (!canSeeAll && entry.userId !== userId)) throw new TimeServiceError('Registro de tiempo no encontrado.', 404)
    await prisma.taskTimeEntry.delete({ where: { id: entryId } })
    return { id: entryId }
  }

  async function projectSummary({ companyId, projectId, userId, canSeeAll }) {
    const entries = await prisma.taskTimeEntry.findMany({
      where: { companyId, task: { projectId }, minutes: { not: null }, ...(canSeeAll ? {} : { userId }) },
      select: { taskId: true, userId: true, startedAt: true, minutes: true },
    })
    return summarize(entries)
  }

  return { addEntry, startTimer, stopTimer, running, closeStaleTimers, listEntries, deleteEntry, projectSummary }
}
