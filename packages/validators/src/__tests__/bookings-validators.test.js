import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bookingPageCreateSchema, bookingPageUpdateSchema, bookingResourceUpdateSchema, bookingServiceCreateSchema,
  bookingServiceUpdateSchema, bookingSpaceCreateSchema, bookingSpaceUpdateSchema, normalizeEmbedOrigin,
} from '../bookings.js'

test('PATCH schemas never inject defaults for fields that were not sent', () => {
  assert.deepEqual(bookingSpaceUpdateSchema.parse({ published: true }), { published: true })
  assert.deepEqual(bookingServiceUpdateSchema.parse({ name: 'Consulta' }), { name: 'Consulta' })
  assert.deepEqual(bookingResourceUpdateSchema.parse({ enabled: false }), { enabled: false })
  assert.deepEqual(bookingPageUpdateSchema.parse({ published: true }), { published: true })
})

test('create schemas keep their defaults', () => {
  assert.equal(bookingSpaceCreateSchema.parse({ name: 'A', slug: 'a', timezone: 'UTC' }).mode, 'internal')
  assert.equal(bookingServiceCreateSchema.parse({ name: 'S', kind: 'appointment', durationMinutes: 30 }).slotStepMinutes, 30)
  assert.deepEqual(bookingPageCreateSchema.parse({ slug: 'mi-pagina', title: 'T' }).serviceIds, [])
})

test('embed origins: only the origin of an HTTPS site (HTTP on loopback), deduplicated', () => {
  assert.deepEqual(bookingPageUpdateSchema.parse({ embedOrigins: ['www.clinica.mx', 'https://www.clinica.mx/', 'http://localhost:4321'] }).embedOrigins, ['https://www.clinica.mx', 'http://localhost:4321'])
  for (const bad of ['http://clinica.mx', 'https://*.clinica.mx', 'https://clinica.mx/reservas', 'https://user:pw@clinica.mx', 'javascript:alert(1)', 'intranet', 'https://clinica.mx?x=1']) {
    assert.equal(bookingPageUpdateSchema.safeParse({ embedOrigins: [bad] }).success, false, bad)
  }
  assert.equal(normalizeEmbedOrigin('https://Reservas.Clinica.MX:8443'), 'https://reservas.clinica.mx:8443')
})
