// Exact money for purchase payments: amounts travel as decimal strings or
// Prisma Decimals and are handled as integer cents (safe integers), never as
// floating-point arithmetic on pesos.
import { PurchasesServiceError } from './purchases-shared.js'

const MAX_CENTS = 99_999_999_999_999 // DECIMAL(14,2)

// '1234.5' | 1234.5 | Decimal -> 123450. Rejects more than two decimals,
// non-numbers and values beyond DECIMAL(14,2).
export function toCents(value, { label = 'El importe' } = {}) {
  if (value == null || value === '') throw new PurchasesServiceError(`${label} es obligatorio.`, 400, 'VALIDATION')
  const text = typeof value === 'object' && typeof value.toFixed === 'function' ? value.toFixed(2) : String(value).trim()
  const match = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(text)
  if (!match) throw new PurchasesServiceError(`${label} debe ser un número con hasta dos decimales.`, 400, 'VALIDATION')
  const cents = Number(match[2]) * 100 + Number((match[3] ?? '').padEnd(2, '0'))
  if (!Number.isSafeInteger(cents) || cents > MAX_CENTS) throw new PurchasesServiceError(`${label} es demasiado grande.`, 400, 'VALIDATION')
  return match[1] ? -cents : cents
}

// 123450 -> '1234.50' (what Prisma writes into DECIMAL columns).
export function centsToDecimal(cents) {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`
}

// 123450 -> 1234.5 for JSON responses (display only, never re-used for math).
export const centsToNumber = cents => Number(centsToDecimal(cents))
