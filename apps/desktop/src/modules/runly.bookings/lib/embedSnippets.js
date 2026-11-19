// Code a business pastes on its own website: a direct link, an embedded calendar
// (iframe + optional auto-height script) and a button. Values are escaped for HTML
// attributes and text; only the page's own portal URL is ever used.
const attr = (value) => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function readableOn(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.4 ? '#0b1220' : '#ffffff'
}

export function embedSnippets({ url, serviceId = null, label = 'Reservar ahora', color = null }) {
  const page = new URL(url)
  if (serviceId) page.searchParams.set('servicio', serviceId)
  const embed = new URL(page)
  embed.searchParams.set('embed', '1')
  const background = /^#[0-9a-fA-F]{6}$/.test(color ?? '') ? color : '#0F766E'
  return {
    link: page.toString(),
    iframe: `<iframe data-runly-booking src="${attr(embed)}" title="Reservaciones en línea" style="display:block;width:100%;height:760px;border:0" loading="lazy"></iframe>\n<script src="${attr(`${page.origin}/runly/bookings-embed.js`)}" async></script>`,
    button: `<a href="${attr(page)}" target="_blank" rel="noopener" style="display:inline-block;padding:12px 24px;border-radius:8px;background:${background};color:${readableOn(background)};font:600 16px/1.2 system-ui,sans-serif;text-decoration:none">${attr(label || 'Reservar ahora')}</a>`,
  }
}
