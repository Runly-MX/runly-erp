import { z } from 'zod';

// runly.bookings contracts (spec: 2026-11-18-bookings-engine-design.md).
const name = z.string().trim().min(1).max(160);
const optionalText = (max) => z.string().trim().max(max).optional().nullable();
const minutes = (min, max) => z.coerce.number().int().min(min).max(max);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Usa el formato HH:MM');
const instant = z.coerce.date().refine((d) => Number.isFinite(d.getTime()), 'Fecha inválida');

export const BOOKING_SPACE_ROLES = ['admin', 'agent', 'viewer'];
export const BOOKING_STATUSES = ['PENDING', 'CONFIRMED', 'CANCELLED', 'REJECTED', 'COMPLETED', 'NO_SHOW', 'EXPIRED'];

export const bookingPolicySchema = z.object({
  leadMinutes: minutes(0, 525600).default(0),
  horizonDays: minutes(1, 730).default(90),
  requiresApproval: z.boolean().default(false),
  holdMinutes: minutes(1, 10080).optional().nullable(),
  cancelUntilMinutes: minutes(0, 525600).optional().nullable(),
  rescheduleUntilMinutes: minutes(0, 525600).optional().nullable(),
  // Resource spaces (v1.2 R1): who may reserve and the longest reservation.
  reservers: z.enum(['company', 'members']).optional(),
  maxMinutes: minutes(15, 720).optional(),
}).strict();

// Update schemas are built from shapes WITHOUT defaults: zod applies `.default()`
// even inside `.partial()`, so a PATCH would silently reset fields it did not send.
const spaceShape = {
  name,
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/, 'Solo minúsculas, números y guiones'),
  description: optionalText(2000),
  mode: z.enum(['internal', 'online', 'hybrid']),
  timezone: z.string().trim().min(1).max(64),
  policy: bookingPolicySchema,
};
export const bookingSpaceCreateSchema = z.object({ ...spaceShape, mode: spaceShape.mode.default('internal'), policy: spaceShape.policy.default({}), purpose: z.enum(['services', 'resources']).default('services') });
export const bookingSpaceUpdateSchema = z.object(spaceShape).partial().extend({
  published: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const bookingMemberSchema = z.object({ role: z.enum(BOOKING_SPACE_ROLES) });

const resourceShape = {
  name,
  type: z.enum(['staff', 'room', 'equipment', 'table', 'other']),
  userId: z.string().uuid().optional().nullable(),
  // Seats of a table (party size limit); empty = not limited.
  capacity: z.coerce.number().int().min(1).max(1000).optional().nullable(),
};
export const bookingResourceCreateSchema = z.object({ ...resourceShape, type: resourceShape.type.default('other') });
export const bookingResourceUpdateSchema = z.object(resourceShape).partial().extend({ enabled: z.boolean().optional() });

export const bookingResourceIdsSchema = z.object({ resourceIds: z.array(z.string().uuid()).max(500) });

const serviceShape = {
  name,
  description: optionalText(2000),
  kind: z.enum(['appointment', 'session']),
  durationMinutes: minutes(1, 1440),
  bufferBeforeMinutes: minutes(0, 720),
  bufferAfterMinutes: minutes(0, 720),
  slotStepMinutes: minutes(5, 1440),
  capacity: minutes(1, 100000),
  minParty: minutes(1, 100000),
  maxParty: minutes(1, 100000),
  // Online appointments (v1.2 R2): a Runly Chat meeting per booking, or one external https URL.
  meeting: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('none') }),
    z.object({ kind: z.literal('runly') }),
    z.object({ kind: z.literal('external'), url: z.string().trim().max(500).url('Escribe un enlace válido').refine((v) => /^https:\/\//i.test(v), 'El enlace debe empezar con https://') }),
  ]),
};
const partyOrder = (s) => s.minParty == null || s.maxParty == null || s.maxParty >= s.minParty;
export const bookingServiceCreateSchema = z.object({
  ...serviceShape,
  bufferBeforeMinutes: serviceShape.bufferBeforeMinutes.default(0),
  bufferAfterMinutes: serviceShape.bufferAfterMinutes.default(0),
  slotStepMinutes: serviceShape.slotStepMinutes.default(30),
  capacity: serviceShape.capacity.default(1),
  minParty: serviceShape.minParty.default(1),
  maxParty: serviceShape.maxParty.default(1),
  meeting: serviceShape.meeting.default({ kind: 'none' }),
}).refine(partyOrder, 'El máximo de personas no puede ser menor al mínimo');
export const bookingServiceUpdateSchema = z.object(serviceShape).partial().omit({ kind: true })
  .extend({ enabled: z.boolean().optional() }).refine(partyOrder, 'El máximo de personas no puede ser menor al mínimo');

const localDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa el formato AAAA-MM-DD');
export const bookingScheduleSchema = z.object({
  rules: z.array(z.object({
    weekday: z.coerce.number().int().min(0).max(6),
    startTime: time,
    endTime: time,
    validFrom: localDate.optional().nullable(),
    validTo: localDate.optional().nullable(),
  }).refine((r) => r.startTime !== r.endTime, 'El inicio y el fin no pueden ser iguales')
    .refine((r) => !r.validFrom || !r.validTo || r.validTo >= r.validFrom, 'La vigencia termina antes de empezar')).max(200),
});

export const bookingExceptionCreateSchema = z.object({
  spaceId: z.string().uuid().optional(),
  resourceId: z.string().uuid().optional(),
  startsAt: instant,
  endsAt: instant,
  kind: z.enum(['closed', 'open']),
  reason: optionalText(500),
}).refine((e) => Boolean(e.spaceId) !== Boolean(e.resourceId), 'Indica un sistema o un recurso')
  .refine((e) => e.endsAt > e.startsAt, 'El fin debe ser posterior al inicio');

export const bookingSessionCreateSchema = z.object({
  serviceId: z.string().uuid(),
  resourceId: z.string().uuid().optional().nullable(),
  startsAt: instant,
  capacity: minutes(1, 100000).optional(),
});

export const bookingAvailabilityQuerySchema = z.object({
  serviceId: z.string().uuid(),
  from: instant,
  to: instant,
  resourceId: z.string().uuid().optional(),
  partySize: z.coerce.number().int().min(1).max(100000).optional(),
  durationMinutes: z.coerce.number().int().min(5).max(720).optional(),
}).refine((q) => q.to > q.from, 'El rango es inválido')
  .refine((q) => q.to - q.from <= 62 * 86400000, 'El rango máximo es de 62 días');

const guest = {
  contactId: z.string().uuid().optional().nullable(),
  guestName: optionalText(160),
  guestEmail: z.string().trim().email().max(254).optional().nullable(),
  guestPhone: optionalText(40),
  notes: optionalText(2000),
};
export const bookingCreateSchema = z.object({
  serviceId: z.string().uuid(),
  startsAt: instant.optional(),
  sessionId: z.string().uuid().optional(),
  resourceId: z.string().uuid().optional(),
  partySize: minutes(1, 100000).default(1),
  // Staff may book a length other than the service's (a longer dinner, a double session).
  durationMinutes: z.coerce.number().int().min(5).max(720).optional(),
  ...guest,
}).refine((b) => Boolean(b.startsAt) !== Boolean(b.sessionId), 'Indica un horario o una sesión')
  .refine((b) => Boolean(b.contactId || b.guestName), 'Indica un contacto o el nombre del cliente');

export const bookingTransitionSchema = z.object({
  reason: optionalText(500),
  expectedVersion: z.coerce.number().int().min(1).optional(),
});

export const bookingRescheduleSchema = z.object({
  startsAt: instant.optional(),
  sessionId: z.string().uuid().optional(),
  resourceId: z.string().uuid().optional(),
  durationMinutes: z.coerce.number().int().min(5).max(720).optional(),
  partySize: z.coerce.number().int().min(1).max(100000).optional(),
  expectedVersion: z.coerce.number().int().min(1).optional(),
}).refine((b) => Boolean(b.startsAt) !== Boolean(b.sessionId), 'Indica un horario o una sesión');

export const bookingListQuerySchema = z.object({
  from: instant.optional(),
  to: instant.optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
});

// A site allowed to embed a page: its origin only (scheme, host, port), HTTPS
// except on loopback for local testing. Paths, wildcards and credentials are refused.
export function normalizeEmbedOrigin(value) {
  const raw = String(value ?? '').trim()
  const text = /^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`
  let url
  try { url = new URL(text) } catch { return null }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) || url.hostname.endsWith('.localhost')
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && loopback)) return null
  if (url.username || url.password || raw.includes('*') || !/^[a-z0-9.-]+$|^\[::1\]$/i.test(url.hostname) || (!loopback && !url.hostname.includes('.'))) return null
  if ((url.pathname !== '/' && url.pathname !== '') || url.search || url.hash) return null
  return url.origin
}

// Public pages (phase 3). The slug is global: it is the public URL.
const pageText = (max) => z.string().trim().max(max).optional().nullable().transform((v) => v || null);
const pageShape = {
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/, 'De 3 a 64 caracteres: minúsculas, números y guiones')
    .refine((s) => s !== 'gestion', 'Esa dirección está reservada'),
  title: name,
  description: pageText(2000),
  location: pageText(500),
  instructions: pageText(2000),
  serviceIds: z.array(z.string().uuid()).max(100),
  published: z.boolean(),
  allowResourceChoice: z.boolean(),
  requirePhone: z.boolean(),
  cancellationPolicy: pageText(2000),
  reschedulePolicy: pageText(2000),
  punctualityPolicy: pageText(2000),
  privacyNotice: pageText(4000),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Usa un color #RRGGBB').optional().nullable(),
  embedOrigins: z.array(z.string().trim().transform(normalizeEmbedOrigin).refine(Boolean, 'Escribe un dominio como https://www.ejemplo.com'))
    .max(20, 'Hasta 20 dominios').transform((list) => [...new Set(list)]),
};
// Defaults only on create: a PATCH must never reset fields it did not send.
export const bookingPageCreateSchema = z.object({
  ...pageShape,
  serviceIds: pageShape.serviceIds.default([]),
  published: pageShape.published.default(false),
  allowResourceChoice: pageShape.allowResourceChoice.default(false),
  requirePhone: pageShape.requirePhone.default(false),
  embedOrigins: pageShape.embedOrigins.default([]),
});
export const bookingPageUpdateSchema = z.object(pageShape).partial().extend({ enabled: z.boolean().optional() });

// What a customer sends. `website` is a honeypot: people never fill it.
export const publicBookingCreateSchema = z.object({
  serviceId: z.string().uuid(),
  startsAt: instant.optional(),
  sessionId: z.string().uuid().optional(),
  resourceId: z.string().uuid().optional(),
  partySize: minutes(1, 1000).default(1),
  guestName: z.string().trim().min(2, 'Escribe tu nombre').max(160),
  guestEmail: z.string().trim().toLowerCase().email('Revisa tu correo').max(254),
  guestPhone: z.string().trim().max(40).regex(/^[0-9+()\-.\s]*$/, 'Revisa el teléfono').optional().nullable().transform((v) => v || null),
  notes: pageText(500),
  acceptedPolicyVersion: z.coerce.number().int().min(1),
  website: z.string().max(0, 'Solicitud inválida').optional(),
}).strict().refine((b) => Boolean(b.startsAt) !== Boolean(b.sessionId), 'Indica un horario o una sesión');

export const publicRescheduleSchema = z.object({
  startsAt: instant.optional(),
  sessionId: z.string().uuid().optional(),
  resourceId: z.string().uuid().optional(),
}).strict().refine((b) => Boolean(b.startsAt) !== Boolean(b.sessionId), 'Indica un horario o una sesión');

export const publicAvailabilityQuerySchema = z.object({
  serviceId: z.string().uuid(),
  from: instant,
  to: instant,
  resourceId: z.string().uuid().optional(),
  vista: z.string().max(200).optional(),
}).refine((q) => q.to > q.from, 'El rango es inválido')
  .refine((q) => q.to - q.from <= 35 * 86400000, 'El rango máximo es de 35 días');

export const publicManageAvailabilitySchema = z.object({
  from: instant,
  to: instant,
  resourceId: z.string().uuid().optional(),
}).refine((q) => q.to > q.from, 'El rango es inválido')
  .refine((q) => q.to - q.from <= 35 * 86400000, 'El rango máximo es de 35 días');

export const bookingSearchQuerySchema = bookingListQuerySchema.extend({
  serviceId: z.string().uuid().optional(),
  resourceId: z.string().uuid().optional(),
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});

// Room and equipment reservations by employees (v1.2 R1). Times on a 15-minute grid;
// participants are company users; headcount counts people who need a seat.
const quarter = instant.refine((d) => d.getTime() % 900000 === 0, 'Usa intervalos de 15 minutos');
const roomTimes = { startsAt: quarter, endsAt: quarter };
const endsAfter = (v) => !v.startsAt || !v.endsAt || v.endsAt > v.startsAt;
export const roomReservationCreateSchema = z.object({
  resourceId: z.string().uuid(),
  title: z.string().trim().min(1, 'Escribe el motivo').max(200),
  ...roomTimes,
  organizerId: z.string().uuid().optional().nullable(),
  participantIds: z.array(z.string().uuid()).max(200).default([]),
  headcount: z.coerce.number().int().min(1).max(1000).optional().nullable(),
  notes: optionalText(2000),
}).strict().refine(endsAfter, { message: 'El fin debe ser después del inicio', path: ['endsAt'] });
export const roomReservationRescheduleSchema = z.object({
  ...roomTimes,
  resourceId: z.string().uuid().optional(),
}).strict().refine(endsAfter, { message: 'El fin debe ser después del inicio', path: ['endsAt'] });
