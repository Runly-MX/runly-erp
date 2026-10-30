import { formatQty, toNumber } from './format.js'

// Units are free text typed by the user ("pza", "tramo", "caja", "kg").
// Abbreviations (short, with a dot or without vowels) stay as typed; whole
// Spanish words take the plural when the quantity is not 1.
const VOWELS = /[aeiouáéíóú]/i

export function pluralUnit(unit, quantity) {
  const text = String(unit ?? '').trim()
  if (!text || Math.abs(toNumber(quantity)) === 1) return text
  if (text.length <= 3 || text.includes('.') || !VOWELS.test(text) || /\s/.test(text)) return text
  const lower = text.toLowerCase()
  if (/s$/.test(lower)) return text
  if (/[aeiouáéó]$/.test(lower)) return `${text}s`
  if (/z$/.test(lower)) return `${text.slice(0, -1)}ces`
  if (/ión$/.test(lower)) return `${text.slice(0, -3)}iones`
  return `${text}es`
}

// "15 tramos", "1 tramo", "20 pza", "3" (no unit).
export const withUnit = (quantity, unit) => {
  const label = pluralUnit(unit, quantity)
  return `${formatQty(quantity)}${label ? ` ${label}` : ''}`
}

// "25 de 40 tramos": the unit agrees with the total.
export const ofTotal = (part, total, unit) => `${formatQty(part)} de ${withUnit(total, unit)}`
