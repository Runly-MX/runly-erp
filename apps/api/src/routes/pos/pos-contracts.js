import { z } from 'zod';
import { Prisma } from '@prisma/client';

export class CommerceError extends Error {
  constructor(code, message, status = 409) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

// PREPARATION_STATION_REQUIRED is reserved for C6; no simulated kitchen route
// is exposed in phase 1. Both UX-requested codes have stable spellings now.
export const COMMERCE_ERROR_CODES = Object.freeze(['VALIDATION_ERROR','FORBIDDEN','NOT_FOUND','ORDER_VERSION_CONFLICT',
  'INSUFFICIENT_STOCK','CURRENCY_MISMATCH','IDEMPOTENCY_CONFLICT','IDEMPOTENCY_REQUIRED','INVALID_TRANSITION',
  'REFUND_REQUIRED','PREPARATION_STATION_REQUIRED','STOCK_RECOVERY_NOT_READY','PRODUCT_UNAVAILABLE','VARIANT_REQUIRED',
  'RECONCILIATION_REQUIRED','CONFIGURATION_REQUIRED','CONTRACT_NOT_AVAILABLE','INTERNAL_ERROR',
  'TABLE_OCCUPIED','TABLE_NAME_CONFLICT','RESOURCE_VERSION_CONFLICT','ALLOCATION_CONFLICT','NO_PENDING_LINES','PREPARATION_ALREADY_DISPATCHED','UNDO_NOT_ALLOWED']);

export const fail = (code, message, status = 409) => { throw new CommerceError(code, message, status); };
export const json = (value) => JSON.parse(JSON.stringify(value));
export const decimal = (value) => new Prisma.Decimal(value);
export const money = (value) => decimal(value).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
export const amount = (value) => money(value).toFixed(2);
export const sum = (rows, field) => rows.reduce((total, row) => total.plus(row[field] ?? 0), decimal(0));
export const RESTAURANT_LATE_AFTER_MINUTES=15;
export const KITCHEN_UNDO_WINDOW_MS=5000;

// One wire representation for command responses, reads and persisted replays.
export function commerceDto(value) {
  const cashFields = new Set(['amount','price','unitPrice','baseUnitPrice','priceDelta','netBase','cashSales','cashIn','cashOut','waiterDeliveries','refundOut']);
  function format(item) {
    if (Array.isArray(item)) return item.map(format);
    if (!item || typeof item !== 'object') return item;
    return Object.fromEntries(Object.entries(item).map(([key, v]) => {
      if (v !== null && v !== undefined && (cashFields.has(key) || key.endsWith('Amount'))) return [key, amount(v)];
      if (v !== null && v !== undefined && ['quantity','returnedQuantity'].includes(key)) return [key, decimal(v).toFixed(3)];
      return [key, format(v)];
    }));
  }
  return format(json(value));
}

const id = z.string().uuid();
const note = z.string().trim().max(1000).nullable().optional();
const reason = z.string().trim().min(1).max(500);
// No exponent, non-finite, negative, extra precision or silent coercion of cents.
const fixed = (scale, positive = false) => z.union([z.string(), z.number().finite()])
  .transform(String).refine((v) => new RegExp(`^\\d{1,9}(?:\\.\\d{1,${scale}})?$`).test(v), 'Importe o cantidad inválido.')
  .refine((v) => !positive || (/^\d+(?:\.\d+)?$/.test(v) && decimal(v).gt(0)), 'Debe ser mayor que cero.');
const cash = fixed(2);
const positiveCash = fixed(2, true);
const quantity = fixed(3, true);
const version = z.number().int().positive();

export const commandSchemas = {
  createOrder: z.object({ outletId: id, terminalId: id.optional(), sessionId: id.optional(),
    experience: z.enum(['RETAIL', 'RESTAURANT']), fulfillmentType: z.enum(['DINE_IN', 'TAKEAWAY', 'PICKUP', 'DELIVERY']),
    tableId: id.optional(), guestCount: z.number().int().min(1).max(99).optional(), notes: note }).strict(),
  addLine: z.object({ expectedVersion: version, productId: id, variantId: id.nullable().optional(), quantity,
    guestSeatId: id.nullable().optional(), note, modifiers: z.array(z.object({ optionId: id }).strict()).max(30).optional() }).strict(),
  updateLine: z.object({ expectedVersion: version, quantity: quantity.optional(), guestSeatId: id.nullable().optional(), note }).strict(),
  deleteLine: z.object({ expectedVersion: version }).strict(),
  discount: z.object({ expectedVersion: version, amount: cash, reason }).strict(),
  payment: z.object({ expectedVersion: version, paymentMethodId: id, amount: positiveCash,
    tenderedAmount: cash.optional(), sessionId: id.optional(), reference: z.string().trim().max(120).nullable().optional(),
    allocations: z.array(z.object({ orderLineId: id, amount: positiveCash }).strict()).max(100).default([]) }).strict(),
  cancel: z.object({ expectedVersion: version, reason }).strict(),
  refund: z.object({ expectedVersion: version, reason, sessionId: id,
    lines: z.array(z.object({ orderLineId: id, quantity, restock: z.boolean() }).strict()).max(100),
    payments: z.array(z.object({ paymentId: id, amount: positiveCash, reference: z.string().trim().max(120).optional() }).strict()).min(1).max(100) }).strict(),
  openSession: z.object({ outletId: id, terminalId: id, openingCashAmount: cash.default('0.00'), notes: note }).strict(),
  closeSession: z.object({ countedCashAmount: cash, notes: note }).strict(),
  cashMovement: z.object({ kind: z.enum(['IN', 'OUT']), amount: positiveCash, reason }).strict(),
  openShift: z.object({ outletId: id }).strict(),
  closeShift: z.object({ sessionId: id, deliveredAmount: cash, notes: note }).strict(),
  createTable: z.object({outletId:id,name:z.string().trim().min(1).max(100),capacity:z.number().int().min(1).max(99).default(2)}).strict(),
  updateTable: z.object({expectedVersion:version,name:z.string().trim().min(1).max(100).optional(),capacity:z.number().int().min(1).max(99).optional(),enabled:z.boolean().optional(),status:z.enum(['AVAILABLE','DIRTY','RESERVED','DISABLED']).optional()}).strict(),
  updateRestaurantOrder: z.object({expectedVersion:version,notes:note,waiterId:id.optional(),guestCount:z.number().int().min(1).max(99).optional()}).strict(),
  dispatch: z.object({expectedVersion:version,lineIds:z.array(id).min(1).max(100)}).strict(),
  kitchenLine: z.object({expectedVersion:version,status:z.enum(['PENDING','IN_PREPARATION','READY','DELIVERED']),reason:reason.optional()}).strict(),
  voidPreparation: z.object({expectedVersion:version,reason}).strict(),
  allocatePayment: z.object({expectedVersion:version,paymentId:id,allocations:z.array(z.object({orderLineId:id,amount:positiveCash}).strict()).max(100)}).strict(),
  seatReservation: z.object({sessionId:id.optional()}).strict(),
  requestBill: z.object({expectedVersion:version}).strict(),
  kitchenPrint: z.object({transport:z.enum(['BROWSER','BLUETOOTH']),reason:reason.optional()}).strict(),
};

export const restaurantQuerySchema=z.object({outletId:id,myTablesOnly:z.enum(['true','false']).transform(v=>v==='true').optional()}).strict();
export const kitchenQuerySchema=z.object({outletId:id,stationId:id.optional(),status:z.enum(['PENDING','IN_PREPARATION','READY','DELIVERED','CANCELLED']).optional(),cursor:id.optional(),limit:z.coerce.number().int().min(1).max(200).default(100)}).strict();

export const resourceIdSchema = id;
export const refundPreviewSchema = z.object({expectedVersion:version,amount:positiveCash.optional(),
  lines:z.array(z.object({orderLineId:id,quantity,restock:z.boolean()}).strict()).max(100)}).strict();
export const shiftStatusSchema = z.enum(['OPEN','CLOSED','CANCELLED']);
export const contextQuerySchema = z.object({ outletId: id.optional(), terminalId: id.optional() }).strict();
export const currentSessionQuerySchema = z.object({outletId:id,terminalId:id}).strict();
export const printJobSchema = z.object({transport:z.enum(['BROWSER','BLUETOOTH']),reason:reason.optional()}).strict();
export const printResultSchema = z.object({status:z.enum(['SUBMITTED','FAILED']),errorCode:z.string().regex(/^[A-Za-z0-9_.:-]{1,120}$/).optional()}).strict()
  .refine((v)=>v.status==='FAILED'||v.errorCode===undefined,'Un envío confirmado al transporte no admite código de error.');
const filterDate=z.union([z.string().date(),z.string().datetime({offset:true})]);
export const listOrdersSchema = z.object({ outletId: id.optional(), status: z.enum(['DRAFT','OPEN','SENT','PARTIALLY_SERVED','SERVED','PAID','CANCELLED','REFUNDED']).optional(),
  pendingPayment:z.enum(['true','false']).transform(v=>v==='true').optional(),
  terminalId:id.optional(),experience:z.enum(['RETAIL','RESTAURANT']).optional(),search:z.string().trim().regex(/^#?\d{1,9}$/).optional(),
  from:filterDate.optional(),to:filterDate.optional(),
  page: z.coerce.number().int().positive().default(1), pageSize: z.coerce.number().int().min(1).max(100).default(50) }).strict();

export function parse(schema, body) {
  const result = schema.safeParse(body);
  if (!result.success) fail('VALIDATION_ERROR', result.error.issues[0]?.message ?? 'Datos inválidos.', 400);
  return result.data;
}

export function lineTotals({ quantity: qty, unitPrice, discountAmount = 0, taxRate, taxIncluded }) {
  const gross = money(money(unitPrice).times(qty)).minus(discountAmount);
  if (gross.lt(0)) fail('VALIDATION_ERROR', 'El descuento excede el importe de la línea.', 400);
  const base = taxIncluded ? money(gross.div(decimal(1).plus(decimal(taxRate).div(100)))) : gross;
  const tax = taxIncluded ? gross.minus(base) : money(base.times(taxRate).div(100));
  return { taxAmount: amount(tax), totalAmount: amount(base.plus(tax)), netBase: amount(base) };
}
