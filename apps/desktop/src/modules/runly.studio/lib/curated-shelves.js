// Editorial shelves for Inicio ("Se acerca Navidad y Año Nuevo", "Para festividades"...). A shelf is a
// title plus a keyword rule over template name, category and description; seasonal ones only show inside
// their window of the year, the evergreen ones always can. Nothing here is stored: it is a view over the catalog.
const fold = value => String(value ?? '').toLocaleLowerCase('es').normalize('NFD').replace(/\p{Diacritic}/gu, '')

// [month, day] windows; a window may wrap over the new year.
const SHELVES = [
  { id: 'navidad', title: 'Se acerca Navidad y Año Nuevo', short: 'Navidad y Año Nuevo', subtitle: 'Invitaciones, cartas y cenas para cerrar el año.', rule: /navidad|posada|ano nuevo|fin de ano|nochebuena|reyes|rosca|cena de|brindis/, window: [[11, 1], [1, 10]] },
  { id: 'buenfin', title: 'Buen Fin y ofertas', subtitle: 'Promociones y descuentos listos para publicar.', rule: /buen fin|oferta|descuento|promocion|black friday|rebaja/, window: [[11, 5], [11, 30]] },
  { id: 'muertos', title: 'Día de muertos', subtitle: 'Ofrendas, calaveras y celebraciones.', rule: /muerto|ofrenda|catrina|calavera|cempasuchil/, window: [[10, 10], [11, 3]] },
  { id: 'patrias', title: 'Fiestas patrias', subtitle: 'Menús, programas y flyers para el mes patrio.', rule: /patri|mexican|independencia|viva mexico|grito/, window: [[8, 20], [9, 20]] },
  { id: 'valentin', title: 'San Valentín', subtitle: 'Mensajes y diseños para el 14 de febrero.', rule: /valentin|amor|corazon|enamorad/, window: [[1, 25], [2, 14]] },
  { id: 'madres', title: 'Día de las madres', subtitle: 'Felicitaciones y detalles para mamá.', rule: /madre|mama/, window: [[4, 25], [5, 10]] },
  { id: 'festividades', title: 'Para festividades', short: 'Festividades', subtitle: 'Invitaciones, cartas y felicitaciones para cualquier celebración.', rule: /invitacion|carta|felicit|fiesta|celebr|cumplean|boda|festiv|evento|noche especial/ },
  { id: 'negocio', title: 'Para tu negocio', short: 'Negocio', subtitle: 'Menús, promociones, tarjetas y folletos.', rule: /menu|promocion|oferta|tarjeta|folleto|catalogo|anuncio|mercado/ },
  { id: 'redes', title: 'Para tus redes sociales', short: 'Redes sociales', subtitle: 'Publicaciones e historias con buen ritmo visual.', rule: /redes|historia|publicacion|post|story/ },
]

const stamp = ([month, day]) => month * 100 + day
export function inWindow(window, date) {
  if (!window) return true
  const now = stamp([date.getMonth() + 1, date.getDate()]), [from, to] = window.map(stamp)
  return from <= to ? now >= from && now <= to : now >= from || now <= to
}

// Items shaped { text } are matched by their own words; the caller maps them back.
export function shelvesFor(pool, { date = new Date(), maxShelves = 4, minItems = 3, perShelf = 10 } = {}) {
  const taken = new Set(), seasonal = SHELVES.filter(shelf => shelf.window && inWindow(shelf.window, date)), evergreen = SHELVES.filter(shelf => !shelf.window)
  const result = []
  for (const shelf of [...seasonal, ...evergreen]) {
    const found = pool.filter(entry => shelf.rule.test(fold(entry.text)) && !taken.has(entry.key)).slice(0, perShelf)
    if (found.length < minItems) continue
    // An item sits on one shelf only, so Inicio never repeats the same card.
    for (const entry of found) taken.add(entry.key)
    result.push({ id: shelf.id, title: shelf.title, subtitle: shelf.subtitle, seasonal: Boolean(shelf.window), entries: found })
    if (result.length >= maxShelves) break
  }
  return result
}

// Shelves that apply today (seasonal ones only in their window), for filter chips.
export const shelfChips = (date = new Date()) => SHELVES.filter(shelf => inWindow(shelf.window, date)).map(({ id, title, short }) => ({ id, title: short ?? title }))
export const matchesShelf = (id, text) => SHELVES.find(shelf => shelf.id === id)?.rule.test(fold(text)) ?? false
