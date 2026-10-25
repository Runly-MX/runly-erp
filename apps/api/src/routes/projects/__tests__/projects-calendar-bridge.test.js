import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { createProjectsCalendarBridge } from '../projects-calendar-bridge.js'

function makeCalendarPrisma(overrides = {}) {
  const calendars = {}
  const shares = {}
  const events = {}
  const tasks = {}
  return {
    calendarCalendar: {
      create: async (args) => {
        const c = { id: 'cal-1', ...args.data }
        calendars[c.id] = c
        return c
      },
      // grantMemberCalendarAccess looks up the owner to skip redundant self-shares.
      findFirst: async ({ where }) => calendars[where.id] ?? { id: where.id, ownerId: 'owner-user' },
      update: async ({ where, data }) => ({ id: where.id, ...data }),
    },
    calendarShare: {
      findFirst: async ({ where }) =>
        Object.values(shares).find((s) => s.calendarId === where.calendarId && s.userId === where.userId) ?? null,
      create: async (args) => {
        const s = { id: 'share-1', ...args.data }
        shares[s.id] = s
        return s
      },
      deleteMany: async () => {},
    },
    calendarEvent: {
      create: async (args) => {
        const e = { id: 'event-1', ...args.data }
        events[e.id] = e
        return e
      },
      update: async ({ where, data }) => ({ id: where.id, ...data }),
      delete: async () => {},
    },
    project: {
      update: async ({ where, data }) => ({ id: where.id, ...data }),
    },
    task: {
      update: async ({ where, data }) => {
        tasks[where.id] = { ...(tasks[where.id] ?? {}), ...data }
        return tasks[where.id]
      },
    },
    ...overrides,
  }
}

function makeNoPrisma() {
  return {}  // No calendarCalendar property — simulates atlas.calendar not installed
}

describe('createProjectsCalendarBridge', () => {
  describe('syncProjectCalendar', () => {
    it('creates a CalendarCalendar and updates project.calendarId', async () => {
      let updatedProject = null
      const prisma = {
        ...makeCalendarPrisma(),
        project: {
          update: async ({ where, data }) => { updatedProject = { id: where.id, ...data }; return updatedProject },
        },
      }
      const bridge = createProjectsCalendarBridge({ prisma })
      const calId = await bridge.syncProjectCalendar({ id: 'proj-1', ownerId: 'user-1', name: 'Mi Proyecto', color: '#6366f1' })
      assert.ok(calId, 'Returns calendar id')
      assert.equal(updatedProject?.calendarId, calId)
    })

    // Regression: the calendar used to be created without the project's
    // companyId, leaving it permanently "personal-shaped" (company_id: null)
    // and throwing off attendee-company validation in calendar-event-service.
    it('tags the created calendar with the project company', async () => {
      let created = null
      const prisma = {
        ...makeCalendarPrisma(),
        calendarCalendar: {
          ...makeCalendarPrisma().calendarCalendar,
          create: async (args) => { created = args.data; return { id: 'cal-1', ...args.data } },
        },
      }
      const bridge = createProjectsCalendarBridge({ prisma })
      await bridge.syncProjectCalendar({ id: 'proj-1', ownerId: 'user-1', companyId: 'company-1', name: 'Mi Proyecto', color: '#6366f1' })
      assert.equal(created?.companyId, 'company-1')
    })

    it('backfills companyId on an already-linked calendar', async () => {
      let updateData = null
      const prisma = {
        ...makeCalendarPrisma(),
        calendarCalendar: {
          ...makeCalendarPrisma().calendarCalendar,
          findFirst: async () => ({ id: 'cal-1' }),
          update: async ({ where, data }) => { updateData = data; return { id: where.id, ...data } },
        },
      }
      const bridge = createProjectsCalendarBridge({ prisma })
      await bridge.syncProjectCalendar({ id: 'proj-1', ownerId: 'user-1', companyId: 'company-1', calendarId: 'cal-1', name: 'Mi Proyecto', color: '#6366f1' })
      assert.equal(updateData?.companyId, 'company-1')
    })

    it('returns null silently when atlas.calendar is not installed', async () => {
      const bridge = createProjectsCalendarBridge({ prisma: makeNoPrisma() })
      const calId = await bridge.syncProjectCalendar({ id: 'proj-1', ownerId: 'user-1', name: 'P', color: null })
      assert.equal(calId, null)
    })
  })

  describe('grantMemberCalendarAccess', () => {
    it('creates a CalendarShare for the new member', async () => {
      let created = null
      const prisma = {
        ...makeCalendarPrisma(),
        calendarShare: {
          ...makeCalendarPrisma().calendarShare,
          create: async (args) => { created = args.data; return { id: 'share-1', ...args.data } },
        },
      }
      const bridge = createProjectsCalendarBridge({ prisma })
      await bridge.grantMemberCalendarAccess('cal-1', 'user-2')
      assert.equal(created?.calendarId, 'cal-1')
      assert.equal(created?.userId, 'user-2')
      assert.equal(created?.role, 'VIEWER')
    })

    it('does nothing when calendarId is null', async () => {
      let called = false
      const prisma = {
        ...makeCalendarPrisma(),
        calendarShare: { ...makeCalendarPrisma().calendarShare, create: async () => { called = true } },
      }
      const bridge = createProjectsCalendarBridge({ prisma })
      await bridge.grantMemberCalendarAccess(null, 'user-2')
      assert.equal(called, false)
    })
  })

  describe('syncTaskEvent', () => {
    it('creates a CalendarEvent with sourceModule=runly.projects when task has dueDate', async () => {
      let created = null
      const prisma = {
        ...makeCalendarPrisma(),
        calendarEvent: {
          ...makeCalendarPrisma().calendarEvent,
          create: async (args) => { created = args.data; return { id: 'event-1', ...args.data } },
        },
      }
      const bridge = createProjectsCalendarBridge({ prisma })
      const task = { id: 'task-1', title: 'Entrega', dueDate: new Date('2026-07-01'), startDate: null, calendarEventId: null }
      await bridge.syncTaskEvent(task, 'cal-1')
      assert.equal(created?.sourceModule, 'runly.projects')
      assert.equal(created?.sourceEntityId, 'task-1')
      assert.equal(created?.calendarId, 'cal-1')
    })

    const day = (value) => new Date(`${value}T12:00:00.000Z`)
    const spy = (extra = {}) => {
      const calls = { created: [], updated: [], deleted: [] }
      const base = makeCalendarPrisma()
      const prisma = {
        ...base,
        calendarEvent: {
          create: async ({ data }) => { calls.created.push(data); return { id: 'event-new', ...data } },
          update: async (args) => { calls.updated.push(args); if (extra.updateFails) { const e = new Error('gone'); e.code = 'P2025'; throw e } return { id: args.where.id } },
          delete: async ({ where }) => { calls.deleted.push(where.id) },
        },
      }
      return { prisma, calls }
    }
    const iso = (d) => d.toISOString().slice(0, 10)

    it('a single due date is a one-day event', async () => {
      const { prisma, calls } = spy()
      await createProjectsCalendarBridge({ prisma }).syncTaskEvent({ id: 't', title: 'T', startDate: null, dueDate: day('2026-11-05'), calendarEventId: null }, 'cal-1')
      assert.deepEqual([iso(calls.created[0].startAt), iso(calls.created[0].endAt)], ['2026-11-05', '2026-11-05'])
    })

    it('only a start date is also a one-day event on that day', async () => {
      const { prisma, calls } = spy()
      await createProjectsCalendarBridge({ prisma }).syncTaskEvent({ id: 't', title: 'T', startDate: day('2026-11-03'), dueDate: null, calendarEventId: null }, 'cal-1')
      assert.deepEqual([iso(calls.created[0].startAt), iso(calls.created[0].endAt)], ['2026-11-03', '2026-11-03'])
    })

    it('a range covers start to due, and a reversed one still covers the days between', async () => {
      const { prisma, calls } = spy()
      const bridge = createProjectsCalendarBridge({ prisma })
      await bridge.syncTaskEvent({ id: 't', title: 'T', startDate: day('2026-11-03'), dueDate: day('2026-11-07'), calendarEventId: null }, 'cal-1')
      await bridge.syncTaskEvent({ id: 't', title: 'T', startDate: day('2026-11-09'), dueDate: day('2026-11-07'), calendarEventId: null }, 'cal-1')
      assert.deepEqual([iso(calls.created[0].startAt), iso(calls.created[0].endAt)], ['2026-11-03', '2026-11-07'])
      assert.deepEqual([iso(calls.created[1].startAt), iso(calls.created[1].endAt)], ['2026-11-07', '2026-11-09'])
    })

    it('changing the dates updates the existing event instead of creating another', async () => {
      const { prisma, calls } = spy()
      const id = await createProjectsCalendarBridge({ prisma }).syncTaskEvent({ id: 't', title: 'Nuevo título', startDate: day('2026-11-03'), dueDate: day('2026-11-04'), calendarEventId: 'ev-1' }, 'cal-1')
      assert.equal(id, 'ev-1')
      assert.equal(calls.created.length, 0)
      assert.deepEqual([calls.updated[0].where.id, iso(calls.updated[0].data.endAt), calls.updated[0].data.title], ['ev-1', '2026-11-04', 'Nuevo título'])
    })

    it('an event the person deleted from the calendar is created again', async () => {
      const { prisma, calls } = spy({ updateFails: true })
      const id = await createProjectsCalendarBridge({ prisma }).syncTaskEvent({ id: 't', title: 'T', startDate: null, dueDate: day('2026-11-05'), calendarEventId: 'gone' }, 'cal-1')
      assert.equal(id, 'event-new')
      assert.equal(calls.created.length, 1)
    })

    it('clearing both dates removes the event', async () => {
      const { prisma, calls } = spy()
      await createProjectsCalendarBridge({ prisma }).syncTaskEvent({ id: 't', title: 'T', startDate: null, dueDate: null, calendarEventId: 'ev-1' }, 'cal-1')
      assert.deepEqual(calls.deleted, ['ev-1'])
    })

    it('returns null when no dueDate', async () => {
      const bridge = createProjectsCalendarBridge({ prisma: makeCalendarPrisma() })
      const result = await bridge.syncTaskEvent(
        { id: 'task-1', title: 'T', dueDate: null, startDate: null, calendarEventId: null },
        'cal-1'
      )
      assert.equal(result, null)
    })
  })
})
