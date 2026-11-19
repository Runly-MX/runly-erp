// Website editor: the Reservaciones block chooses among the company's live booking
// pages (and their services) instead of typing a slug. A saved reference that is no
// longer live stays visible, labeled, so opening a page never silently changes it.
export function withBookingFields(block, pages = [], savedBlocks = []) {
  if (block.type !== 'BookingPortalBlock') return block
  const pageOptions = pages.map((p) => ({ value: p.slug, label: `${p.title} (${p.spaceName})` }))
  const serviceOptions = pages.flatMap((p) => p.services.map((s) => ({ value: s.id, label: `${p.title}: ${s.name}` })))
  for (const saved of savedBlocks) {
    if (saved?.type !== block.type) continue
    const { bookingPage, serviceId } = saved.props ?? {}
    if (bookingPage && !pageOptions.some((o) => o.value === bookingPage)) pageOptions.push({ value: bookingPage, label: 'Página no disponible o sin publicar' })
    if (serviceId && !serviceOptions.some((o) => o.value === serviceId)) serviceOptions.push({ value: serviceId, label: 'Servicio no disponible' })
  }
  return {
    ...block,
    fields: {
      ...block.fields,
      bookingPage: { type: 'select', label: 'Página de reservaciones', allowEmpty: true, options: pageOptions },
      serviceId: { type: 'select', label: 'Servicio (opcional, todos si se deja vacío)', allowEmpty: true, options: serviceOptions },
    },
  }
}
