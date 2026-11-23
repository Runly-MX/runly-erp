import test from 'node:test'
import assert from 'node:assert/strict'
import { formatMoney, orderStatus, ORDER_STATUS_OPTIONS } from '../orders.js'
import { readFileSync } from 'node:fs'

test('order statuses have Spanish labels and unknown ones degrade safely', () => {
  assert.deepEqual([orderStatus('paid').label, orderStatus('pending').tone, orderStatus('cancelled').label], ['Pagado', 'warning', 'Cancelado'])
  assert.equal(orderStatus('hacked').label, 'En proceso')
  assert.deepEqual(ORDER_STATUS_OPTIONS.map((o) => o.value), ['', 'pending', 'paid', 'cancelled'])
})

test('money formatting never throws on odd currencies', () => {
  assert.match(formatMoney(1200, 'mxn'), /1,200/)
  assert.doesNotThrow(() => formatMoney(1, 'not-a-currency'))
  assert.doesNotThrow(() => formatMoney(1, undefined))
})

test('the Pedidos tab is a site section and its screen is wired in the workspace (sources, since they import React hooks)', () => {
  const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8')
  assert.match(read('../siteSections.js'), /id: 'orders', label: 'Pedidos'/)
  assert.match(read('../../screens/sites/SiteWorkspace.jsx'), /orders: <Lazy><OrdersScreen siteId=\{siteId\} \/><\/Lazy>/)
})
