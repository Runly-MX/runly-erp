// D2 (ticketing spec section 9): read-only view of a POS sale for modules that must
// prove a payment server-side (Ticketing box office). Never trusts a client: status,
// currency, lines, discounts and refunds come from the POS tables. With lock: true the
// order row is locked in the caller's transaction, so two confirmations of the same
// sale serialize and a refund cannot slip in between the check and the caller's write.
export async function readPosSale(tx, { companyId, orderId, lock = false }) {
  const order = lock
    ? (await tx.$queryRaw`SELECT * FROM pos_order WHERE id = ${orderId}::uuid AND company_id = ${companyId}::uuid FOR UPDATE`)[0]
    : (await tx.$queryRaw`SELECT * FROM pos_order WHERE id = ${orderId}::uuid AND company_id = ${companyId}::uuid`)[0]
  if (!order) return null
  const [lines, refunds, settings] = await Promise.all([
    tx.$queryRaw`SELECT id, product_id, variant_id, product_name, quantity, unit_price, discount_amount, total_amount, voided, returned_quantity FROM pos_order_line WHERE order_id = ${order.id}::uuid ORDER BY created_at, id`,
    tx.$queryRaw`
      SELECT r.id AS refund_id, l.order_line_id, l.quantity FROM pos_refund r JOIN pos_refund_line l ON l.refund_id = r.id
       WHERE r.order_id = ${order.id}::uuid AND r.company_id = ${companyId}::uuid ORDER BY r.created_at, r.id`,
    tx.$queryRaw`SELECT currency FROM pos_settings WHERE company_id = ${companyId}::uuid`,
  ])
  const money = (v) => Number(v ?? 0).toFixed(2)
  return {
    id: order.id,
    orderNumber: order.order_number,
    status: order.status,
    currency: order.currency ?? settings[0]?.currency ?? null,
    totalAmount: money(order.total_amount),
    paidAmount: money(order.paid_amount),
    discountAmount: money(order.discount_amount),
    refundedAmount: money(order.refunded_amount),
    paidAt: order.paid_at,
    lines: lines.map((l) => ({
      id: l.id, productId: l.product_id, variantId: l.variant_id, name: l.product_name, quantity: Number(l.quantity),
      unitPrice: money(l.unit_price), discountAmount: money(l.discount_amount), totalAmount: money(l.total_amount),
      voided: l.voided, refundedQuantity: Number(l.returned_quantity ?? 0),
    })),
    refunds: refunds.map((r) => ({ refundId: r.refund_id, orderLineId: r.order_line_id, quantity: Number(r.quantity) })),
  }
}

// Recent paid sales of the company that include some of these products: what staff can
// pick to confirm a ticket order whose Caja confirmation was interrupted.
export async function listPaidSalesWithProducts(db, { companyId, productIds, since, exclude = [] }) {
  if (!productIds.length) return []
  return db.$queryRaw`
    SELECT o.id, o.order_number, o.total_amount, o.paid_at, o.customer_name FROM pos_order o
     WHERE o.company_id = ${companyId}::uuid AND o.status = 'PAID' AND o.paid_at >= ${since}
       AND NOT (o.id = ANY(${exclude}::uuid[]))
       AND EXISTS (SELECT 1 FROM pos_order_line l WHERE l.order_id = o.id AND NOT l.voided AND l.product_id = ANY(${productIds}::uuid[]))
     ORDER BY o.paid_at DESC LIMIT 20`
}
