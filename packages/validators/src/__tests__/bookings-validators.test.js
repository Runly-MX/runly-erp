import test from 'node:test'
import assert from 'node:assert/strict'
import {
  bookingPageCreateSchema, bookingPageUpdateSchema, bookingResourceUpdateSchema, bookingServiceCreateSchema,
  bookingServiceUpdateSchema, bookingSpaceCreateSchema, bookingSpaceUpdateSchema,
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
