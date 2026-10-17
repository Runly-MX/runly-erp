// Pure helpers behind NumberField's min/max/integer handling.

const toBound = (value) => {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

// Negatives are allowed only when the caller allows them AND the range does.
export function resolveAllowNegative(allowNegative, min) {
  const lower = toBound(min);
  if (lower !== null && lower >= 0) return false;
  return allowNegative !== false;
}

// Normalizes a typed value against the bounds.
// Returns null when nothing must change (blank, unparsable or already valid),
// otherwise { value, reason } with reason "min" | "max" | "integer".
export function normalizeNumber(raw, { min, max, allowDecimal = true } = {}) {
  const text = String(raw ?? "").trim();
  if (text === "") return null;
  let number = Number(text);
  if (!Number.isFinite(number)) return null;
  let reason = null;
  if (!allowDecimal && !Number.isInteger(number)) {
    number = Math.round(number);
    reason = "integer";
  }
  const lower = toBound(min);
  const upper = toBound(max);
  if (lower !== null && number < lower) {
    number = allowDecimal ? lower : Math.ceil(lower);
    reason = "min";
  } else if (upper !== null && number > upper) {
    number = allowDecimal ? upper : Math.floor(upper);
    reason = "max";
  }
  if (!reason) return null;
  return { value: number, reason };
}

// Spanish inline note shown after an automatic adjustment.
export function adjustmentNote({ value, reason }) {
  if (reason === "min") return `Se ajustó al mínimo permitido (${value}).`;
  if (reason === "max") return `Se ajustó al máximo permitido (${value}).`;
  return `Se redondeó a ${value}.`;
}

// Pasted text without the minus sign when negatives aren't allowed, or null
// when the paste can go through as is.
export function sanitizePastedNumber(text, { allowNegative = true } = {}) {
  const raw = String(text ?? "").trim();
  if (allowNegative || !raw.includes("-")) return null;
  const cleaned = raw.replace(/-/g, "");
  return Number.isFinite(Number(cleaned)) && cleaned !== "" ? cleaned : "";
}
