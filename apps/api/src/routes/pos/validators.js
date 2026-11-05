import { z } from "zod";

const moneySchema = z.coerce.number().finite();
const optionalNullableText = (max) => z.string().max(max).nullable().optional();

export const uuidSchema = z.string().uuid();

export const posModeSchema = z.enum(["RESTAURANT", "RETAIL", "HYBRID"]);
export const orderStatusSchema = z.enum([
  "DRAFT",
  "OPEN",
  "SENT",
  "PARTIALLY_SERVED",
  "SERVED",
  "PAID",
  "CANCELLED",
  "REFUNDED",
]);
export const fulfillmentTypeSchema = z.enum(["DINE_IN", "TAKEAWAY", "DELIVERY", "PICKUP"]);
export const salesChannelSchema = z.enum([
  "IN_STORE",
  "PHONE",
  "WEBSITE",
  "UBER_EATS",
  "RAPPI",
  "DIDI_FOOD",
  "OTHER",
]);
export const tableStatusSchema = z.enum([
  "AVAILABLE",
  "OCCUPIED",
  "BILL_REQUESTED",
  "DIRTY",
  "RESERVED",
  "DISABLED",
]);
export const kitchenStatusSchema = z.enum([
  "PENDING",
  "IN_PREPARATION",
  "READY",
  "DELIVERED",
  "CANCELLED",
]);

export const updateSettingsSchema = z.object({
  mode: posModeSchema.optional(),
  currency: z.string().min(3).max(3).optional(),
  defaultTaxRate: moneySchema.min(0).max(100).optional(),
  pricesIncludeTax: z.boolean().optional(),
  tipsEnabled: z.boolean().optional(),
  serviceChargeRate: moneySchema.min(0).max(100).optional(),
  receiptFooter: optionalNullableText(1000),
  appointmentsEnabled: z.boolean().optional(),
});

export const setupSchema = z.object({
  mode: posModeSchema,
  outletName: z.string().trim().min(1).max(160),
  terminalName: z.string().trim().min(1).max(160),
}).strict();

export const createOutletSchema = z.object({
  name: z.string().min(1).max(160),
  code: optionalNullableText(40),
  address: optionalNullableText(500),
  mode: posModeSchema.optional(),
});

export const updateOutletSchema = createOutletSchema.partial().extend({
  enabled: z.boolean().optional(),
  allowTableCharge: z.boolean().optional(),
  defaultStationId: z.string().uuid().nullable().optional(),
  kitchenKdsEnabled: z.boolean().optional(),
  kitchenPrintEnabled: z.boolean().optional(),
});

export const createTerminalSchema = z.object({
  outletId: uuidSchema,
  name: z.string().min(1).max(160),
  code: optionalNullableText(40),
});

export const updateTerminalSchema = createTerminalSchema.omit({ outletId: true }).partial().extend({
  outletId: uuidSchema.optional(),
  enabled: z.boolean().optional(),
});

export const openSessionSchema = z.object({
  outletId: uuidSchema,
  terminalId: uuidSchema,
  openingCashAmount: moneySchema.min(0).default(0),
  notes: optionalNullableText(1000),
});

export const closeSessionSchema = z.object({
  countedCashAmount: moneySchema.min(0),
  notes: optionalNullableText(1000),
});

export const cashMovementSchema = z.object({
  kind: z.enum(["IN", "OUT"]),
  amount: moneySchema.positive(),
  reason: z.string().min(1).max(300),
});

export const createOrderSchema = z.object({
  outletId: uuidSchema,
  sessionId: uuidSchema.nullable().optional(),
  terminalId: uuidSchema.nullable().optional(),
  tableId: uuidSchema.nullable().optional(),
  fulfillmentType: fulfillmentTypeSchema.default("DINE_IN"),
  salesChannel: salesChannelSchema.default("IN_STORE"),
  customerName: optionalNullableText(160),
  customerPhone: optionalNullableText(80),
  guestCount: z.coerce.number().int().min(1).max(99).default(1),
  notes: optionalNullableText(1000),
});

export const updateOrderSchema = z.object({
  tableId: uuidSchema.nullable().optional(),
  fulfillmentType: fulfillmentTypeSchema.optional(),
  customerName: optionalNullableText(160),
  customerPhone: optionalNullableText(80),
  guestCount: z.coerce.number().int().min(1).max(99).optional(),
  notes: optionalNullableText(1000),
});

export const addOrderLineSchema = z.object({
  guestSeatId: uuidSchema.nullable().optional(),
  productId: uuidSchema.optional(),
  variantId: uuidSchema.nullable().optional(),
  quantity: z.coerce.number().positive(),
  unitPrice: moneySchema.min(0).optional(),
  note: optionalNullableText(500),
  modifiers: z.array(z.object({ optionId: uuidSchema })).max(30).optional(),
});

export const updateOrderLineSchema = z.object({
  guestSeatId: uuidSchema.nullable().optional(),
  quantity: z.coerce.number().positive().optional(),
  unitPrice: moneySchema.min(0).optional(),
  note: optionalNullableText(500),
});

export const createGuestSchema = z.object({
  label: z.string().min(1).max(80),
});

export const createPaymentSchema = z.object({
  paymentMethodId: uuidSchema,
  amount: moneySchema.positive(),
  reference: optionalNullableText(120),
  sessionId: z.string().uuid().optional(),
});

export const cancelOrderSchema = z.object({
  reason: optionalNullableText(500),
});

export const createFloorSchema = z.object({
  outletId: uuidSchema,
  name: z.string().min(1).max(160),
  canvasWidth: z.coerce.number().int().min(320).max(10000).default(1200),
  canvasHeight: z.coerce.number().int().min(320).max(10000).default(800),
});

export const updateFloorSchema = createFloorSchema.omit({ outletId: true }).partial().extend({
  isActive: z.boolean().optional(),
});

export const createTableSchema = z.object({
  floorId: uuidSchema,
  zoneId: uuidSchema.nullable().optional(),
  name: z.string().min(1).max(80),
  capacity: z.coerce.number().int().min(1).max(99).default(2),
});

export const updateTableSchema = createTableSchema.omit({ floorId: true }).partial().extend({
  floorId: uuidSchema.optional(),
  enabled: z.boolean().optional(),
});

export const floorElementSchema = z.object({
  id: uuidSchema.optional(),
  kind: z.enum([
    'TABLE_SQUARE', 'TABLE_ROUND',
    'BAR', 'WALL', 'PLANT', 'DOOR',
    'FLOOR_ZONE', 'PILLAR', 'SOFA', 'WINDOW', 'STAIRS',
    'POLYGON',
  ]),
  x: z.coerce.number().min(0),
  y: z.coerce.number().min(0),
  width: z.coerce.number().min(10),
  height: z.coerce.number().min(10),
  rotation: z.coerce.number().min(-360).max(360).default(0).optional(),
  label: z.string().max(80).nullable().optional(),
  tableName: z.string().max(80).nullable().optional(),
  capacity: z.coerce.number().int().min(0).max(999).optional(),
  chairStyle: z.enum(['auto', 'two_sides', 'one_side', 'none']).optional(),
  color: z.string().max(40).nullable().optional(),
  style: z.record(z.unknown()).nullable().optional(),
});

export const saveLayoutSchema = z.object({
  elements: z.array(floorElementSchema).min(0).max(500),
});

export const tableStatusUpdateSchema = z.object({
  status: tableStatusSchema,
});

export const createStationSchema = z.object({
  outletId: uuidSchema,
  name: z.string().min(1).max(160),
  code: z.string().min(1).max(60),
  color: optionalNullableText(32),
});

export const updateStationSchema = createStationSchema.omit({ outletId: true }).partial().extend({
  outletId: uuidSchema.optional(),
  enabled: z.boolean().optional(),
});

export const kitchenStatusUpdateSchema = z.object({
  status: kitchenStatusSchema,
});

export const paymentMethodKindSchema = z.enum(["CASH", "CARD", "TRANSFER"]);

export const createPaymentMethodSchema = z.object({
  name: z.string().min(1).max(100),
  code: z.string().min(1).max(50),
  kind: paymentMethodKindSchema,
  requiresReference: z.boolean().optional(),
  enabled: z.boolean().optional(),
});

export const updatePaymentMethodSchema = createPaymentMethodSchema.partial();

export const reservationStatusSchema = z.enum([
  "CONFIRMED",
  "SEATED",
  "CANCELLED",
  "NO_SHOW",
]);

export const createReservationSchema = z.object({
  outletId: z.string().uuid(),
  tableId: z.string().uuid().nullable().optional(),
  guestName: z.string().min(1).max(160),
  guestPhone: optionalNullableText(60),
  partySize: z.coerce.number().int().min(1).max(50).optional(),
  scheduledAt: z.string().datetime({ offset: true }),
  durationMinutes: z.coerce.number().int().min(15).max(720).optional(),
  notes: optionalNullableText(1000),
});

export const updateReservationSchema = z.object({
  guestName: z.string().min(1).max(160).optional(),
  guestPhone: optionalNullableText(60),
  partySize: z.coerce.number().int().min(1).max(50).optional(),
  scheduledAt: z.string().datetime({ offset: true }).optional(),
  durationMinutes: z.coerce.number().int().min(15).max(720).optional(),
  notes: optionalNullableText(1000),
  status: reservationStatusSchema.optional(),
});

export const seatReservationSchema = z.object({
  sessionId: z.string().uuid().nullable().optional(),
});

export const assignWaiterSchema = z.object({
  waiterId: z.string().uuid("El ID de mesero debe ser un UUID valido.").nullable().optional(),
});

export const openWaiterShiftSchema = z.object({
  outletId: z.string().uuid(),
});

export const closeWaiterShiftSchema = z.object({
  deliveredAmount: z.coerce.number().min(0),
  sessionId: z.string().uuid(),
  notes: z.string().max(500).optional(),
});

export const createModifierGroupSchema = z
  .object({
    name: z.string().min(1).max(80),
    minSelect: z.coerce.number().int().min(0).default(0),
    maxSelect: z.coerce.number().int().min(1).default(1),
    required: z.boolean().default(false),
    position: z.coerce.number().int().min(0).default(0),
  })
  .refine((v) => v.minSelect <= v.maxSelect, { message: "minSelect no puede ser mayor que maxSelect." });

export const updateModifierGroupSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  minSelect: z.coerce.number().int().min(0).optional(),
  maxSelect: z.coerce.number().int().min(1).optional(),
  required: z.boolean().optional(),
  position: z.coerce.number().int().min(0).optional(),
  enabled: z.boolean().optional(),
});

export const createModifierOptionSchema = z.object({
  name: z.string().min(1).max(80),
  priceDelta: moneySchema.min(0).default(0),
  position: z.coerce.number().int().min(0).default(0),
});

export const updateModifierOptionSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  priceDelta: moneySchema.min(0).optional(),
  position: z.coerce.number().int().min(0).optional(),
  enabled: z.boolean().optional(),
});

export const updateProductConfigSchema = z
  .object({
    stationId: uuidSchema.nullable().optional(),
    requiresPreparation: z.boolean().optional(),
    availableInPos: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "Nada que actualizar." });
