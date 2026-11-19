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
}).strict();

export const bookingSpaceCreateSchema = z.object({
  name,
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/, 'Solo minúsculas, números y guiones'),
  description: optionalText(2000),
  mode: z.enum(['internal', 'online', 'hybrid']).default('internal'),
  timezone: z.string().trim().min(1).max(64),
  policy: bookingPolicySchema.default({}),
});
export const bookingSpaceUpdateSchema = bookingSpaceCreateSchema.partial().extend({
  published: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const bookingMemberSchema = z.object({ role: z.enum(BOOKING_SPACE_ROLES) });

export const bookingResourceCreateSchema = z.object({
  name,
  type: z.enum(['staff', 'room', 'equipment', 'table', 'other']).default('other'),
  userId: z.string().uuid().optional().nullable(),
});
export const bookingResourceUpdateSchema = bookingResourceCreateSchema.partial().extend({ enabled: z.boolean().optional() });

export const bookingResourceIdsSchema = z.object({ resourceIds: z.array(z.string().uuid()).max(500) });

const serviceShape = {
  name,
  description: optionalText(2000),
  kind: z.enum(['appointment', 'session']),
  durationMinutes: minutes(1, 1440),
  bufferBeforeMinutes: minutes(0, 720).default(0),
  bufferAfterMinutes: minutes(0, 720).default(0),
  slotStepMinutes: minutes(5, 1440).default(30),
  capacity: minutes(1, 100000).default(1),
  minParty: minutes(1, 100000).default(1),
  maxParty: minutes(1, 100000).default(1),
};
const partyOrder = (s) => s.minParty == null || s.maxParty == null || s.maxParty >= s.minParty;
export const bookingServiceCreateSchema = z.object(serviceShape).refine(partyOrder, 'El máximo de personas no puede ser menor al mínimo');
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
  expectedVersion: z.coerce.number().int().min(1).optional(),
}).refine((b) => Boolean(b.startsAt) !== Boolean(b.sessionId), 'Indica un horario o una sesión');

export const bookingListQuerySchema = z.object({
  from: instant.optional(),
  to: instant.optional(),
  status: z.enum(BOOKING_STATUSES).optional(),
});

export const bookingSearchQuerySchema = bookingListQuerySchema.extend({
  serviceId: z.string().uuid().optional(),
  resourceId: z.string().uuid().optional(),
  q: z.string().trim().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(500).default(50),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});
