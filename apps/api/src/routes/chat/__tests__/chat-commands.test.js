import test from 'node:test'
import assert from 'node:assert/strict'
import { parseDndArgument, parseStatusArgument, createChatCommandsService } from '../chat-commands-service.js'

const now = new Date('2026-11-04T12:00:00Z')

test('/nomolestar understands minutes, hours, tomorrow and off; nonsense is refused', () => {
  assert.equal(parseDndArgument('30m', now).until.toISOString(), '2026-11-04T12:30:00.000Z')
  assert.equal(parseDndArgument('2 horas', now).until.toISOString(), '2026-11-04T14:00:00.000Z')
  assert.equal(parseDndArgument('', now).until.toISOString(), '2026-11-04T13:00:00.000Z')
  assert.ok(parseDndArgument('mañana', now).until > now)
  assert.equal(parseDndArgument('off', now).off, true)
  assert.equal(parseDndArgument('cuando quieras', now), null)
})

test('/estado splits a leading emoji from the text, defaults one, and clears', () => {
  assert.deepEqual(parseStatusArgument('🍽️ Comiendo'), { emoji: '🍽️', text: 'Comiendo' })
  assert.deepEqual(parseStatusArgument('En una visita'), { emoji: '💬', text: 'En una visita' })
  assert.equal(parseStatusArgument('limpiar').clear, true)
  assert.equal(parseStatusArgument('').clear, true)
})

function make(overrides = {}) {
  const calls = []
  const service = createChatCommandsService({
    prisma: { $queryRaw: async () => (overrides.member === false ? [] : [{ '?column?': 1 }]) },
    statusService: { setStatus: async (id, s) => { calls.push(['status', s]); return s }, getDnd: async () => ({ quiet: { enabled: false } }), setDnd: async (id, d) => { calls.push(['dnd', d]); return d } },
    projectsService: { getOrCreatePersonalProject: async () => ({ id: 'p1' }) },
    tasksService: { createTask: async (pid, uid, data) => { calls.push(['task', data]); return { id: 't1', title: data.title } } },
  })
  return { service, calls }
}

test('commands run as the caller and return a summary', async () => {
  const { service, calls } = make()
  const base = { companyId: 'c', profileId: 'u', conversationId: '00000000-0000-4000-8000-000000000001' }
  assert.match((await service.run({ ...base, command: 'estado', args: '🌴 Vacaciones' })).summary, /Vacaciones/)
  assert.match((await service.run({ ...base, command: 'nomolestar', args: '1h' })).summary, /activado/)
  const task = await service.run({ ...base, command: 'tarea', args: 'Llamar al cliente' })
  assert.equal(task.link, '/app/m/runly.projects?open=task:t1&project=p1')
  assert.match(calls.find((c) => c[0] === 'task')[1].description, /inbox\/00000000/)
})

test('unknown command, empty task title and a conversation the person is not in are refused', async () => {
  const { service } = make()
  const base = { companyId: 'c', profileId: 'u' }
  await assert.rejects(() => service.run({ ...base, command: 'hackear' }), (e) => e.status === 404)
  await assert.rejects(() => service.run({ ...base, command: 'tarea', args: '  ' }), (e) => e.status === 400)
  await assert.rejects(() => make({ member: false }).service.run({ ...base, command: 'estado', args: 'x', conversationId: '00000000-0000-4000-8000-000000000001' }), (e) => e.status === 404)
})
