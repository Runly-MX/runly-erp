import test from 'node:test'
import assert from 'node:assert/strict'
import { embedSnippets } from './embedSnippets.js'
import { embedState } from '../public/portalLib.js'
import { withBookingFields } from '../../runly.website/lib/bookingBlockFields.js'

test('snippets carry only the portal URL, escaped, with the embed flag and the service', () => {
  const s = embedSnippets({ url: 'https://erp.example.test/app/p/reservar/centro', serviceId: 'svc-1', label: 'Agenda "ya" <hoy>', color: '#fde047' })
  assert.equal(s.link, 'https://erp.example.test/app/p/reservar/centro?servicio=svc-1')
  assert.match(s.iframe, /src="https:\/\/erp.example.test\/app\/p\/reservar\/centro\?servicio=svc-1&amp;embed=1"/)
  assert.match(s.iframe, /<script src="https:\/\/erp.example.test\/runly\/bookings-embed\.js" async><\/script>/)
  assert.match(s.button, />Agenda &quot;ya&quot; &lt;hoy&gt;<\/a>$/)
  assert.match(s.button, /background:#fde047;color:#0b1220/, 'dark text on a light accent')
  assert.match(embedSnippets({ url: 'https://erp.example.test/app/p/reservar/x', color: 'red;}' }).button, /background:#0F766E/)
})

test('embed guard: authorized parent, foreign parent, unknown parent and top level', () => {
  const win = (parent, own = 'https://erp.example.test') => ({ self: 1, top: parent === null ? 1 : 2, location: { origin: own, ancestorOrigins: parent ? [parent] : [] }, document: { referrer: '' } })
  assert.deepEqual(embedState(['https://clinica.example.test'], win(null)), { framed: false, blocked: false, parent: null })
  assert.equal(embedState(['https://clinica.example.test'], win('https://clinica.example.test')).blocked, false)
  assert.equal(embedState(['https://clinica.example.test'], win('https://ajeno.example.test')).blocked, true)
  assert.equal(embedState([], win('https://erp.example.test')).blocked, false, 'the ERP itself (editor canvas)')
  assert.equal(embedState([], win(undefined)).blocked, false, 'browser does not tell: CSP decides')
})

test('the Website editor offers live pages and keeps a saved reference that is no longer live', () => {
  const block = { type: 'BookingPortalBlock', fields: { bookingPage: { type: 'text' }, serviceId: { type: 'text' }, display: { type: 'select' } } }
  const pages = [{ slug: 'centro', title: 'Agenda', spaceName: 'Clínica', services: [{ id: 's1', name: 'Consulta' }] }]
  const out = withBookingFields(block, pages, [{ type: 'BookingPortalBlock', props: { bookingPage: 'vieja', serviceId: 's9' } }])
  assert.deepEqual(out.fields.bookingPage.options.map((o) => o.value), ['centro', 'vieja'])
  assert.deepEqual(out.fields.serviceId.options.map((o) => o.label), ['Agenda: Consulta', 'Servicio no disponible'])
  const hero = { type: 'HeroBlock' }
  assert.equal(withBookingFields(hero, pages), hero)
})
