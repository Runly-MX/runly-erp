import { z } from "zod";

const FORBIDDEN_PROPERTY_PARTS = [
  "authorization",
  "cookie",
  "email",
  "message",
  "password",
  "phone",
  "token",
  "value",
];
const FORBIDDEN_PROPERTY_KEYS = new Set([
  "fields",
  "formdata",
  "formvalues",
  "payload",
  "values",
]);

const opaqueIdSchema = z.string().trim().min(1).max(200);
const eventNameSchema = z
  .string()
  .trim()
  .min(1)
  .max(80)
  .regex(/^[a-z][a-z0-9_.:-]*$/i);

export function filterSafeEventProperties(properties) {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) {
    return {};
  }

  const safe = {};
  for (const [rawKey, value] of Object.entries(properties)) {
    if (Object.keys(safe).length >= 20) break;

    const key = String(rawKey).trim().slice(0, 80);
    const normalizedKey = key.toLowerCase();
    if (
      !key ||
      FORBIDDEN_PROPERTY_KEYS.has(normalizedKey.replace(/[^a-z0-9]/g, "")) ||
      FORBIDDEN_PROPERTY_PARTS.some((part) => normalizedKey.includes(part))
    ) {
      continue;
    }

    if (
      value === null ||
      typeof value === "boolean" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      safe[key] = value;
      continue;
    }

    if (typeof value === "string") {
      safe[key] = value.slice(0, 500);
    }
  }
  return safe;
}

export const storefrontEventSchema = z.object({
  id: opaqueIdSchema,
  name: eventNameSchema,
  occurredAt: z.string().datetime({ offset: true }),
  path: z.string().max(2048).optional(),
  referrer: z.string().max(2048).optional(),
  formId: z.string().uuid().optional(),
  submissionId: z.string().uuid().optional(),
  properties: z
    .record(z.string(), z.unknown())
    .optional()
    .transform((value) => filterSafeEventProperties(value)),
});

export const storefrontEventBatchSchema = z.object({
  visitorId: opaqueIdSchema,
  sessionId: opaqueIdSchema,
  consent: z.enum(["granted", "denied", "unknown"]).default("unknown"),
  events: z.array(storefrontEventSchema).min(1).max(50),
});

export const publicFormSubmissionSchema = z.object({
  expectedDefinitionRevision: z.number().int().nonnegative().optional(),
  values: z.record(z.string(), z.unknown()),
  visitorId: opaqueIdSchema.optional(),
  sessionId: opaqueIdSchema.optional(),
  turnstileToken: z.string().trim().max(4096).optional(),
  honeypot: z.string().max(500).optional().default(""),
});
