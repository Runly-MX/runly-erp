// apps/desktop/src/modules/runly.pos/retail/lib/retailErrors.js
//
// POS command errors on top of the shared commerce classification (attempt
// keys, lost responses, forbidden, stock, validation).
import { classifyCommerceError } from '../../../runly.catalog/lib/commerceCommand.js'
import { RESTAURANT_ERRORS } from '../../restaurant/lib/restaurantRules.js'

const POS_MESSAGES = {
  ...RESTAURANT_ERRORS,
  ORDER_VERSION_CONFLICT: { kind: 'conflict', message: 'La venta cambió en otro dispositivo. Ya se recargó: revisa el total y vuelve a intentarlo.' },
  REFUND_REQUIRED: { kind: 'validation', message: 'Esta venta tiene pagos aplicados. Devuelve primero lo cobrado desde Órdenes.' },
  INVALID_TRANSITION: { kind: 'validation', message: null },
  CURRENCY_MISMATCH: { kind: 'config', message: 'La moneda de la venta no coincide con la de la caja. Revisa la configuración del punto de venta.' },
  NOT_AVAILABLE_AT_OUTLET: { kind: 'validation', message: 'Este producto no se vende en esta sucursal.' },
  PRODUCT_UNAVAILABLE: { kind: 'validation', message: 'Este producto ya no está disponible.' },
  VARIANT_REQUIRED: { kind: 'validation', message: 'Elige una variante antes de agregarlo.' },
  STOCK_RECOVERY_NOT_READY: { kind: 'config', message: 'Un artículo de la venta necesita conciliación de existencias antes de cobrarse.' },
  CONTRACT_NOT_AVAILABLE: { kind: 'validation', message: 'Esta función todavía no está disponible.' },
}

export function classifyPosError(error) {
  const code = error?.code ?? null
  if(['PENDING_OPERATION','company_changed','RECOVERY_STORAGE_UNAVAILABLE'].includes(code))return{kind:'lost',code,retrySameKey:true,message:error.message}
  const base = classifyCommerceError(error)
  if (base.kind === 'lost' || base.kind === 'forbidden') return base
  const pos = POS_MESSAGES[code]
  if (!pos) return base
  return { ...base, kind: pos.kind, code, message: pos.message ?? (error?.message || base.message) }
}

export { createAttemptTracker, newAttemptKey } from '../../../runly.catalog/lib/commerceCommand.js'
