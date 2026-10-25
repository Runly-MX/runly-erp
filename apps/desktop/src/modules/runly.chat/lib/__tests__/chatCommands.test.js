import test from 'node:test'
import assert from 'node:assert/strict'
import { parseCommand, CHAT_COMMANDS } from '../chatCommands.js'

test('known commands parse with their arguments, accents and case ignored', () => {
  assert.equal(parseCommand('/estado 🍽️ Comiendo').command.key, 'estado')
  assert.equal(parseCommand('/estado 🍽️ Comiendo').args, '🍽️ Comiendo')
  assert.equal(parseCommand('/NoMolestar 1h').command.key, 'nomolestar')
  assert.equal(parseCommand('/dnd').command.key, 'nomolestar')
  assert.equal(parseCommand('/tarea  Llamar  ').args, 'Llamar')
})

test('anything else is a normal message', () => {
  assert.equal(parseCommand('hola /estado'), null)
  assert.equal(parseCommand('/inventarios:taladro'), null)
  assert.equal(parseCommand('/desconocido x'), null)
  assert.equal(parseCommand('http://ejemplo.com'), null)
  assert.equal(parseCommand(''), null)
})

test('every command has a description and a place to run', () => {
  assert.ok(CHAT_COMMANDS.every((c) => c.description && ['server', 'app'].includes(c.where)))
})
