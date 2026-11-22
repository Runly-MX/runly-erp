import { z } from 'zod';

// runly.ticketing contracts (spec: 2026-11-20-ticketing-design.md, F6B).
// Update schemas are built WITHOUT defaults: zod applies `.default()` inside
// `.partial()`, and a PATCH must never reset fields it did not send.
const text = (max) => z.string().trim().min(1).max(max);
const optionalText = (max) => z.string().trim().max(max).optional().nullable();
const int = (min, max) => z.coerce.number().int().min(min).max(max);
const instant = z.coerce.date().refine((d) => Number.isFinite(d.getTime()), 'Fecha inválida');
const email = z.string().trim().toLowerCase().email('Correo inválido').max(254);

export const TICKET_CHANNELS = ['box_office', 'portal', 'website', 'api'];

const policyShape = {
  transferAllowed: z.boolean(),
  transferCutoffMinutes: int(0, 10080).nullable(),
  maxPerOrder: int(1, 100),
  holderNameRequired: z.boolean(),
  holdMinutes: int(1, 1440),
  refundText: optionalText(2000),
};
export const ticketPolicySchema = z.object({
  transferAllowed: policyShape.transferAllowed.default(true),
  transferCutoffMinutes: policyShape.transferCutoffMinutes.optional().default(null),
  maxPerOrder: policyShape.maxPerOrder.default(10),
  holderNameRequired: policyShape.holderNameRequired.default(false),
  holdMinutes: policyShape.holdMinutes.default(15),
  refundText: policyShape.refundText,
}).strict();

const eventShape = {
  title: text(160),
  description: optionalText(5000),
  venue: optionalText(500),
};
export const ticketEventCreateSchema = z.object({
  ...eventShape,
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{1,62}[a-z0-9])$/, 'De 3 a 64 caracteres: minúsculas, números y guiones'),
  timezone: z.string().trim().min(1).max(64),
  durationMinutes: int(1, 1440).default(120),
  policy: ticketPolicySchema.default({}),
}).strict();
// Sites allowed to show the portal inside an iframe (besides the company's own Runly websites).
export const embedOriginSchema = z.string().trim().toLowerCase().max(200)
  .regex(/^https:\/\/(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}(?::\d{1,5})?$/, 'Escribe el origen completo, por ejemplo https://www.tusitio.com');
export const ticketEventUpdateSchema = z.object({
  ...eventShape,
  policy: z.object(policyShape).partial().strict(),
  salesOpen: z.boolean(),
  enabled: z.boolean(),
  // F6E publication.
  published: z.boolean(),
  imageFileId: z.string().uuid().nullable(),
  embedOrigins: z.array(embedOriginSchema).max(20).transform((list) => [...new Set(list)]),
}).partial().strict();

export const ticketSessionMoveSchema = z.object({ startsAt: instant }).strict();
export const ticketResendSchema = z.object({ ticketIds: z.array(z.string().uuid()).min(1).max(100).optional() }).strict();

// F6E public portal: free tickets only (paid ones are sold at the box office until online payments exist).
export const publicTicketOrderSchema = z.object({
  sessionId: z.string().uuid(),
  items: z.array(z.object({ typeId: z.string().uuid(), quantity: int(1, 100) }).strict()).min(1).max(20),
  buyer: z.object({ name: text(160), email, phone: optionalText(40) }).strict(),
  holders: z.array(z.object({ name: optionalText(160), email: email.optional().nullable() }).strict()).max(100).optional(),
  acceptedPolicyVersion: int(1, 100000),
  website: z.string().max(0).optional(), // honeypot: humans never fill it
}).strict();

export const ticketSessionCreateSchema = z.object({
  startsAt: instant,
  capacity: int(1, 100000),
  doorsOpenAt: instant.optional().nullable(),
  admitBeforeMinutes: int(0, 1440).optional(),
  admitAfterMinutes: int(0, 1440).optional(),
}).strict();

const typeShape = {
  name: text(120),
  description: optionalText(2000),
  perOrderMax: int(1, 100),
  salesStart: instant.nullable(),
  salesEnd: instant.nullable(),
  visibility: z.enum(['public', 'private', 'box_office']),
  sort: int(0, 10000),
};
export const ticketTypeCreateSchema = z.object({
  ...typeShape,
  priceMode: z.enum(['free', 'pos']).default('free'),
  catalogProductId: z.string().uuid().optional().nullable(),
  perOrderMax: typeShape.perOrderMax.default(10),
  salesStart: typeShape.salesStart.optional(),
  salesEnd: typeShape.salesEnd.optional(),
  visibility: typeShape.visibility.default('public'),
  sort: typeShape.sort.default(0),
}).strict();
export const ticketTypeUpdateSchema = z.object({ ...typeShape, enabled: z.boolean() }).partial().strict();

export const ticketQuotaSchema = z.object({ quota: int(0, 100000).nullable() }).strict();

const holderSchema = z.object({ name: optionalText(160), email: email.optional().nullable() }).strict();
export const ticketOrderCreateSchema = z.object({
  sessionId: z.string().uuid(),
  channel: z.enum(TICKET_CHANNELS).default('box_office'),
  items: z.array(z.object({ typeId: z.string().uuid(), quantity: int(1, 100) }).strict()).min(1).max(20),
  buyer: z.object({
    contactId: z.string().uuid().optional().nullable(),
    name: optionalText(160),
    email: email.optional().nullable(),
    phone: optionalText(40),
  }).strict().default({}),
  // One per ticket, in item order; missing holders take the buyer's name.
  holders: z.array(holderSchema).max(100).optional(),
}).strict();

export const ticketCancelSchema = z.object({ reason: optionalText(500), ticketIds: z.array(z.string().uuid()).min(1).max(100).optional() }).strict();
export const ticketConfirmPaymentSchema = z.object({ posOrderId: z.string().uuid() }).strict();
export const ticketMemberSchema = z.object({ role: z.enum(['admin', 'agent', 'viewer']) }).strict();
export const ticketTransferSchema = z.object({ holderName: text(160), holderEmail: email.optional().nullable() }).strict();

// Check-in (F6D): the scanned RT1 text, or the printed ticket code typed by staff.
// admit = false validates without consuming the entry. deviceId is a random id of the
// reader (not a credential), used for rate limits and the audit.
export const ticketScanSchema = z.object({
  text: z.string().max(512).optional(),
  code: z.string().trim().toUpperCase().regex(/^[0-9A-F]{10}$/, 'El código tiene 10 caracteres (0-9, A-F).').optional(),
  deviceId: z.string().regex(/^[A-Za-z0-9_-]{8,64}$/).optional().nullable(),
  admit: z.boolean().default(true),
}).strict().refine((v) => Boolean(v.text) !== Boolean(v.code), 'Envía el QR o el código del boleto.');
