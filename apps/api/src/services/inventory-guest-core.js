// inventory-guest-core.js - pure helpers of the supplier (guest) portal: tokens, hashes, TTLs, errors.
// Same primitives as the LMS guest invites: opaque random tokens of which only sha256 is stored, and an
// optional 8-char access code (salted hash). Spec 2026-10-20-inventory-areas-scoping, phase 3.
import crypto from 'node:crypto';
import { InventoryServiceError } from './inventory-guards.js';

export const INVITE_TTL_DAYS = 14;
// Sliding: every refresh and every 10 minutes of use pushes the expiry this far ahead (capped by the invite).
export const SESSION_TTL_HOURS = 24;
export const GUEST_ROLES = ['viewer', 'editor'];
// 32 random bytes -> 43 url-safe characters (link token and session token).
export const GUEST_TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const newGuestToken = () => crypto.randomBytes(32).toString('base64url');
export const hashGuestToken = (token) => crypto.createHash('sha256').update(`inv-guest:${String(token)}`).digest('hex');
export const guestLinkPath = (token) => `/app/p/inventory/${token}`;

// `Authorization: Guest <token>` -> token, or null when absent or malformed.
export function parseGuestAuthorization(header) {
  const match = /^Guest\s+(\S+)$/i.exec(String(header ?? '').trim());
  return match && GUEST_TOKEN_RE.test(match[1]) ? match[1] : null;
}

export function normalizeGuestEmail(value) {
  const email = String(value ?? '').trim().toLowerCase();
  if (!email || email.length > 255 || !EMAIL_RE.test(email)) throw new InventoryServiceError('Escribe un correo válido.', 400);
  return email;
}

export const addDays = (date, days) => new Date(date.getTime() + days * 86_400_000);
export const addHours = (date, hours) => new Date(date.getTime() + hours * 3_600_000);

// One generic answer for an unknown, revoked, expired or disabled link: nothing to enumerate.
export const invalidLink = () => new InventoryServiceError('El enlace no es válido o ya expiró. Pide uno nuevo a quien te invitó.', 401, 'INVALID_LINK');
export const codeRequired = () => new InventoryServiceError('Escribe tu código de acceso.', 401, 'CODE_REQUIRED');
export const invalidCode = () => new InventoryServiceError('El código de acceso no es correcto.', 401, 'INVALID_CODE');
export const sessionInvalid = () => new InventoryServiceError('Tu sesión expiró. Abre de nuevo el enlace de tu invitación.', 401, 'SESSION_INVALID');
