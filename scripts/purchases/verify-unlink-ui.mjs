// Real unlink through the current detail panel, on its own disposable stack.
import assert from 'node:assert/strict'
import { bootPurchasesStack } from './validation-stack.mjs'

const s = await bootPurchasesStack()
try {
  await s.assertDisposable()
  const company = await s.createCompany('Desvinculación')
  const role = await s.createRole(company, 'compras', '%')
  const user = await s.createUser('unlink@example.test', `Unlink-${Date.now()}!`, [[company, role]])
  const api = s.client(await s.login(user), company)
  assert.equal((await api('PUT', '/purchases/settings', { profile: 'DOCUMENTARY' })).status, 200)
  const order = (await api('POST', '/purchases/orders', { reference: 'OC-UNLINK' })).body.data
  const invoice = (await api('POST', '/purchases/invoices', { reference: 'FAC-UNLINK' })).body.data
  assert.equal((await api('POST', '/purchases/relations', { sourceType: 'purchase_invoice', sourceId: invoice.id, targetType: 'purchase_order', targetId: order.id })).status, 201)
  const relationCount = async () => (await s.q("SELECT count(*)::int AS n FROM entity_relation WHERE source_id=$1 AND target_id=$2 AND relation_type='BILLED_FROM'", [invoice.id, order.id])).rows[0].n
  const { page, context } = await s.open(user, company)
  await page.goto(`${s.root}/invoices/${invoice.id}`)
  const panel = page.getByRole('region', { name: 'Documentos relacionados' })
  const unlink = panel.getByRole('button', { name: /^Quitar relación con/ })
  await unlink.waitFor({ timeout: 60000 })
  assert.equal(await unlink.count(), 1, 'structural case membership has no unlink button')
  await unlink.click()
  let dialog = page.getByRole('dialog')
  await dialog.getByText('Motivo (opcional)', { exact: true }).waitFor()
  await dialog.getByRole('button', { name: 'Cancelar', exact: true }).click()
  assert.equal(await relationCount(), 1, 'cancel keeps the relation')
  console.log('PASS cancel preserves the link')
  await unlink.click()
  dialog = page.getByRole('dialog')
  const confirm = dialog.getByRole('button', { name: 'Quitar relación', exact: true })
  await dialog.getByText('Motivo (opcional)', { exact: true }).waitFor()
  await confirm.click()
  await dialog.waitFor({ state: 'hidden' })
  await unlink.waitFor({ state: 'hidden' })
  assert.equal(await relationCount(), 0, 'UI confirmation removes the persisted relation')
  for (const [kind, doc] of [['orders', order], ['invoices', invoice]]) assert.equal((await api('GET', `/purchases/${kind}/${doc.id}`)).status, 200, 'documents preserved')
  assert.equal(s.errors.length, 0, s.errors.join(' | '))
  console.log('PASS real unlink persisted, both documents preserved, no page errors or 5xx')
  await context.close()
} finally {
  await s.close()
}
