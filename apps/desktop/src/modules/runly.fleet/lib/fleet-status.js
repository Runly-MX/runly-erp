// Operational status of a vehicle: label and colour shared by the summary
// screen and anything else that draws the fleet mix.
export const VEHICLE_STATUSES = [
  { value: "active", label: "Activos", color: "#10b981" },
  { value: "maintenance", label: "En mantenimiento", color: "#f59e0b" },
  { value: "inactive", label: "Inactivos", color: "#94a3b8" },
  { value: "retired", label: "Retirados", color: "#ef4444" },
];

export const REPORT_TYPE_LABELS = {
  maintenance: "Mantenimiento",
  service: "Servicio",
  repair: "Reparacion",
  other: "Otro",
};

export const MONTH_NAMES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// "2026-03" -> "mar 26"
export function formatMonth(key) {
  const [year, month] = String(key).split("-");
  return `${MONTH_NAMES[Number(month) - 1] ?? month} ${String(year).slice(2)}`;
}

// "2026-03-14" -> "14/03/2026" (no Date parsing, so no timezone shift)
export function formatDay(value) {
  const [y, m, d] = String(value ?? "").slice(0, 10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : "";
}

export function daysLabel(daysLeft) {
  if (daysLeft === 0) return "hoy";
  if (daysLeft < 0) return `hace ${Math.abs(daysLeft)} d`;
  return `en ${daysLeft} d`;
}
