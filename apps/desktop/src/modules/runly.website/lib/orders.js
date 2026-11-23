// Presentation helpers of the Website "Pedidos" tab.
const STATUS = {
  pending: { label: 'Pendiente de pago', tone: 'warning' },
  paid: { label: 'Pagado', tone: 'success' },
  cancelled: { label: 'Cancelado', tone: 'neutral' },
}
export const orderStatus = (status) => STATUS[status] ?? { label: 'En proceso', tone: 'neutral' }
export const ORDER_STATUS_OPTIONS = [{ value: '', label: 'Todos' }, ...Object.entries(STATUS).map(([value, { label }]) => ({ value, label }))]

export function formatMoney(amount, currency, locale = 'es-MX') {
  try { return new Intl.NumberFormat(locale, { style: 'currency', currency: String(currency).toUpperCase() }).format(amount) } catch { return `${Number(amount).toFixed(2)} ${String(currency ?? '').toUpperCase()}`.trim() }
}
