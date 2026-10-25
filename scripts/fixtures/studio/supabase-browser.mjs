import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { resolve, join } from 'node:path'
import { readFile } from 'node:fs/promises'
import { chromium } from 'playwright'

const require = createRequire(resolve('apps/api/package.json'))
const sharp = require('sharp')

export async function verifyStudioSupabase(stack, { users, companies, admin }) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const checks = [], errors = []
  const [owner, denied, peer] = users, [a, b] = companies
  async function api(path, token, company = a.id, options = {}) {
    return fetch(`${stack.urls.api}${path}`, { signal: AbortSignal.timeout(15000), ...options, headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}), 'X-Runly-Company-Id': company,
      ...(options.body && typeof options.body === 'string' ? { 'Content-Type': 'application/json' } : {}), ...options.headers } })
  }
  async function loginApi(user) {
    const response = await api('/auth/login', null, a.id, { method: 'POST', body: JSON.stringify({ identifier: user.email, password: user.password }) })
    assert.equal(response.status, 200, await response.clone().text())
    return (await response.json()).data.access_token
  }
  async function loginUi(user) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } })
    const page = await context.newPage()
    page.on('pageerror', error => errors.push(error.message))
    await page.goto(`${stack.urls.web}/app/login`)
    await page.locator('#identifier').fill(user.email)
    await page.locator('#password').fill(user.password)
    const response = page.waitForResponse(response => response.url() === `${stack.urls.api}/auth/login`)
    await page.getByRole('button', { name: 'Acceder al sistema', exact: true }).click()
    assert.equal((await response).status(), 200)
    await page.waitForURL(url => !url.pathname.includes('/login'))
    await page.goto(`${stack.urls.web}/app/m/runly.studio/`)
    return { context, page }
  }
  try {
    const token = await loginApi(owner), deniedToken = await loginApi(denied), peerToken = await loginApi(peer)
    assert.equal((await api('/studio/designs')).status, 401)
    assert.equal((await api('/studio/designs', deniedToken)).status, 403)
    assert.equal((await api('/studio/designs', token)).status, 200)
    await stack.pool.query('UPDATE membership SET role_id=$1 WHERE company_id=$2 AND user_id=$3', [a.roleId, a.id, denied.id])
    assert.equal((await api('/studio/designs', deniedToken)).status, 200)
    await stack.pool.query('UPDATE membership SET role_id=NULL WHERE company_id=$1 AND user_id=$2', [a.id, denied.id])
    assert.equal((await api('/studio/designs', deniedToken)).status, 403)
    checks.push('real Supabase users, Runly login, membership RBAC: 401/403/200')
    const { page, context } = await loginUi(owner)
    await page.getByRole('button', { name: 'Crear diseño', exact: true }).click()
    await page.getByRole('button', { name: 'Texto', exact: true }).click()
    await page.getByLabel('Texto del elemento', { exact: true }).fill('Studio aislado con Auth real')
    await page.getByRole('button', { name: 'Rectángulo', exact: true }).click()
    await page.getByRole('button', { name: 'Círculo', exact: true }).click()
    const original = await sharp({ create: { width: 1600, height: 1000, channels: 4, background: '#f59e0b' } }).png().toBuffer()
    await page.locator('input[type=file]').setInputFiles({ name: 'original.png', mimeType: 'image/png', buffer: original })
    await page.getByRole('button', { name: '4. Imagen', exact: true }).click()
    await page.getByLabel('Posición X', { exact: true }).fill('400')
    await page.getByLabel('Posición Y', { exact: true }).fill('500')
    await page.getByLabel('Ancho', { exact: true }).fill('400')
    await page.getByLabel('Nombre del diseño').fill('Diseño sintético E2E')
    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await page.getByRole('status').filter({ hasText: /^Guardado$/ }).waitFor()
    const id = new URL(page.url()).searchParams.get('design')
    const record = (await (await api(`/studio/designs/${id}`, token)).json()).data
    assert.equal(record.document.objects.length, 4)
    assert.equal(record.document.objects[0].text, 'Studio aislado con Auth real')
    const fileId = record.document.objects[3].fileAssetId
    const file = (await stack.pool.query('SELECT * FROM file_asset WHERE id=$1', [fileId])).rows[0]
    assert.equal(file.entity_id, a.id); assert.equal(file.uploaded_by_id, owner.id)
    const signed = await (await api(`/files/${fileId}/signed-url`, token)).json()
    const signedUrl = signed.data?.signedUrl ?? signed.signedUrl
    assert.ok(new URL(signedUrl).searchParams.has('token'))
    assert.equal(new URL(signedUrl).origin, stack.urls.kong)
    const stored = Buffer.from(await (await fetch(signedUrl)).arrayBuffer())
    assert.deepEqual(stored, original)
    assert.equal((await sharp(stored).metadata()).width, 1600)
    checks.push('real Files multipart upload + private Storage original bytes, dimensions and temporary signed URL')
    const second = await loginUi(owner)
    await second.page.goto(`${stack.urls.web}/app/m/runly.studio/?design=${id}`)
    await second.page.getByRole('button', { name: '1. Texto', exact: true }).click()
    assert.equal(await second.page.getByLabel('Texto del elemento', { exact: true }).inputValue(), record.document.objects[0].text)
    const downloadPromise = second.page.waitForEvent('download')
    await second.page.getByRole('button', { name: 'Exportar PNG', exact: true }).click()
    await (await downloadPromise).saveAs(join(stack.directory, 'real-export.png'))
    const png = await readFile(join(stack.directory, 'real-export.png'))
    const { data: pixels, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
    assert.equal(info.width, 1080); assert.equal(info.height, 1080)
    const pixel = (520 * info.width + 420) * 4
    assert.deepEqual([...pixels.subarray(pixel, pixel + 4)], [245, 158, 11, 255])
    checks.push('second real login reopens editable design; exported PNG has original image pixels')
    assert.equal((await api(`/studio/designs/${id}`, peerToken)).status, 404)
    assert.equal((await api(`/studio/designs/${id}`, token, b.id)).status, 404)
    assert.equal((await api(`/studio/designs/${id}`, deniedToken)).status, 403)
    const input = { name: record.name, document: record.document, revision: record.revision }
    await second.page.getByRole('button', { name: '1. Texto', exact: true }).click()
    await second.page.getByLabel('Texto del elemento', { exact: true }).fill('Copia local del conflicto')
    const updates = await Promise.all([1, 2].map(() => api(`/studio/designs/${id}`, token, a.id, { method: 'PUT', body: JSON.stringify(input) })))
    assert.deepEqual(updates.map(response => response.status).sort(), [200, 409])
    assert.equal((await api(`/studio/designs/${id}`, token, b.id, { method: 'PUT', body: JSON.stringify(input) })).status, 404)
    const audit = await stack.pool.query("SELECT action FROM audit_log WHERE entity_id=$1 AND module_key='runly.studio'", [id])
    assert.equal(audit.rows.filter(row => row.action === 'studio.design.create').length, 1)
    assert.equal(audit.rows.filter(row => row.action === 'studio.design.update').length, 2)
    checks.push('cross-owner/company and stale company context rejected; concurrent save 200/409; transactional audit')
    await second.page.getByText('Conflicto de versiones', { exact: true }).waitFor()
    await second.page.getByRole('button', { name: 'Revisar versión del servidor', exact: true }).click()
    await second.page.getByRole('button', { name: 'Cargar versión del servidor', exact: true }).click()
    await second.page.getByRole('button', { name: 'Recuperar copia local', exact: true }).click()
    await second.page.getByRole('button', { name: '1. Texto', exact: true }).click()
    assert.equal(await second.page.getByLabel('Texto del elemento', { exact: true }).inputValue(), 'Copia local del conflicto')
    await second.page.getByRole('button', { name: 'Guardar como copia', exact: true }).click()
    await second.page.waitForURL(url => url.searchParams.get('design') !== id)
    const copiedId = new URL(second.page.url()).searchParams.get('design')
    assert.ok(copiedId)
    const copied = (await (await api(`/studio/designs/${copiedId}`, token)).json()).data
    assert.equal(copied.document.objects[0].text, 'Copia local del conflicto')
    assert.equal((await (await api(`/studio/designs/${id}`, token)).json()).data.document.objects[0].text, record.document.objects[0].text)
    // No intercepted responses: Chromium goes offline while the real API stays up.
    await second.page.getByRole('button', { name: '1. Texto', exact: true }).click()
    await second.page.getByLabel('Texto del elemento', { exact: true }).fill('Edición sin conexión')
    await second.context.setOffline(true)
    await second.page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await second.page.getByText('El diseño conserva tus cambios', { exact: true }).waitFor()
    await second.context.setOffline(false)
    second.page.once('dialog', dialog => dialog.accept())
    await second.page.reload()
    await second.page.getByRole('button', { name: 'Recuperar copia local', exact: true }).click()
    await second.page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await second.page.getByRole('status').filter({ hasText: /^Guardado$/ }).waitFor()
    assert.equal((await (await api(`/studio/designs/${copiedId}`, token)).json()).data.document.objects[0].text, 'Edición sin conexión')
    checks.push('real 409 recovery: review server, recover draft, save independent copy; offline draft survives reload and safe retry')
    // Commit editor operations, then confirm ordering/flags survive persistence.
    await second.page.getByRole('button', { name: '4. Imagen', exact: true }).click()
    await second.page.getByRole('button', { name: 'Duplicar', exact: true }).click()
    await second.page.getByRole('button', { name: 'Deshacer', exact: true }).click()
    await second.page.getByRole('button', { name: '5. Imagen', exact: true }).waitFor({ state: 'detached' })
    assert.equal(await second.page.getByRole('button', { name: '5. Imagen', exact: true }).count(), 0)
    await second.page.getByRole('button', { name: 'Rehacer', exact: true }).click()
    await second.page.getByRole('button', { name: '5. Imagen', exact: true }).click()
    await second.page.getByRole('button', { name: 'Copiar', exact: true }).click()
    await second.page.getByRole('button', { name: 'Pegar', exact: true }).click()
    const editorRegion = second.page.getByRole('application', { name: 'Editor gráfico de Studio' })
    await editorRegion.focus(); await second.page.keyboard.press('Control+z')
    await second.page.getByRole('button', { name: '6. Imagen', exact: true }).waitFor({ state: 'detached' })
    assert.equal(await second.page.getByRole('button', { name: '6. Imagen', exact: true }).count(), 0)
    await editorRegion.focus(); await second.page.keyboard.press('Control+Shift+z')
    await second.page.getByRole('button', { name: '6. Imagen', exact: true }).waitFor()
    await editorRegion.focus(); await second.page.keyboard.press('Control+z')
    await second.page.getByRole('button', { name: '6. Imagen', exact: true }).waitFor({ state: 'detached' })
    await editorRegion.focus(); await second.page.keyboard.press('Control+y')
    await second.page.getByRole('button', { name: '6. Imagen', exact: true }).click()
    await second.page.getByRole('button', { name: 'Enviar atrás', exact: true }).click()
    await second.page.getByRole('button', { name: 'Ocultar', exact: true }).click()
    await second.page.getByRole('button', { name: 'Bloquear', exact: true }).click()
    assert.equal(await second.page.getByLabel('Posición X', { exact: true }).isDisabled(), true)
    await second.page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await second.page.getByRole('status').filter({ hasText: /^Guardado$/ }).waitFor()
    const layered = (await (await api(`/studio/designs/${copiedId}`, token)).json()).data
    assert.equal(layered.document.schemaVersion, 2)
    assert.equal(layered.document.objects.length, 6)
    assert.equal(layered.document.objects[0].hidden, true); assert.equal(layered.document.objects[0].locked, true)
    await second.page.reload()
    await second.page.getByRole('button', { name: '1. Imagen · Bloqueado · Oculto', exact: true }).click()
    await second.page.getByRole('button', { name: 'Desbloquear', exact: true }).click()
    await second.page.getByRole('button', { name: 'Mostrar', exact: true }).click()
    await second.page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await second.page.getByRole('status').filter({ hasText: /^Guardado$/ }).waitFor()
    checks.push('undo/redo, duplicate, copy/paste, z-order, lock and visibility persist in document v2')
    // Actual company switch in the shell, followed by the stale design URL.
    await page.locator('button[title="Studio Test A"]').click()
    await page.getByRole('menuitem').filter({ hasText: 'Studio Test B' }).click()
    await page.goto(`${stack.urls.web}/app/m/runly.studio/?design=${id}`)
    await page.getByText('Diseño no encontrado.', { exact: true }).waitFor()
    checks.push('real company switch clears context and rejects the previous design URL')
    const foreign = { ...record.document, objects: record.document.objects.map(object => object.type === 'image' ? { ...object, fileAssetId: peer.id } : object) }
    assert.equal((await api('/studio/designs', token, a.id, { method: 'POST', body: JSON.stringify({ name: 'Missing image', document: foreign }) })).status, 403)
    await stack.pool.query('UPDATE file_asset SET enabled=false WHERE id=$1', [fileId])
    assert.ok([403, 404].includes((await api(`/files/${fileId}/signed-url`, token)).status))
    assert.equal((await api('/studio/designs', token, a.id, { method: 'POST', body: JSON.stringify({ name: 'Disabled image', document: record.document }) })).status, 403)
    await second.page.goto(`${stack.urls.web}/app/m/runly.studio/?design=${id}`)
    await second.page.getByText('Diseño no encontrado.', { exact: true }).waitFor()
    assert.equal(await second.page.getByRole('button', { name: 'Exportar PNG', exact: true }).count(), 0)
    await stack.pool.query('UPDATE file_asset SET enabled=true,entity_id=$2 WHERE id=$1', [fileId, b.id])
    assert.equal((await api('/studio/designs', token, a.id, { method: 'POST', body: JSON.stringify({ name: 'Foreign image', document: record.document }) })).status, 403)
    await stack.pool.query('UPDATE file_asset SET entity_id=$2 WHERE id=$1', [fileId, a.id])
    await second.page.getByRole('button', { name: 'Reintentar', exact: true }).click()
    await second.page.getByRole('button', { name: '4. Imagen', exact: true }).click()
    assert.equal(await second.page.getByRole('button', { name: 'Exportar PNG', exact: true }).isEnabled(), true)
    const { data: expiry, error } = await admin.storage.from(file.bucket).createSignedUrl(file.object_key, 1)
    assert.equal(error, null)
    await new Promise(resolve => setTimeout(resolve, 2100))
    assert.ok(!(await fetch(expiry.signedUrl)).ok)
    const fresh = await (await api(`/files/${fileId}/signed-url`, token)).json()
    assert.ok((await fetch(fresh.data?.signedUrl ?? fresh.signedUrl)).ok)
    checks.push('missing/disabled/foreign assets rejected; actual expired Storage signature rejected and refreshed')
    // Pause retains its IP; stop/start can test Kong DNS churn instead of Storage recovery.
    await stack.compose(['pause', 'supabase-storage'])
    const outage = await fetch(signedUrl, { signal: AbortSignal.timeout(10000) }).catch(error => ({ ok: false, error: error.name }))
    assert.equal(outage.ok, false)
    await second.page.reload()
    await second.page.getByText('No se pudo completar la operación', { exact: true }).waitFor()
    assert.equal(await second.page.getByRole('button', { name: 'Exportar PNG', exact: true }).isDisabled(), true)
    assert.equal(await second.page.getByLabel('Nombre del diseño').isDisabled(), true)
    assert.equal((await second.page.getByRole('application').innerText()).includes('token='), false)
    await stack.compose(['unpause', 'supabase-storage'])
    let storageReady = false
    for (let attempt = 0; attempt < 30; attempt++) {
      const response = await api(`/files/${fileId}/signed-url`, token).catch(() => null)
      if (response?.ok) {
        const signed = await response.json(), url = signed.data?.signedUrl ?? signed.signedUrl
        if ((await fetch(url, { signal: AbortSignal.timeout(5000), cache: 'no-store' }).catch(() => null))?.ok) { storageReady = true; break }
      }
      await new Promise(resolve => setTimeout(resolve, 500))
    }
    assert.equal(storageReady, true, 'Kong/API must observe Storage recovery before retry')
    await second.page.getByRole('button', { name: 'Reintentar', exact: true }).click()
    await second.page.getByRole('button', { name: '4. Imagen', exact: true }).click()
    checks.push('actual Storage process outage (pause/unpause); image retry recovers editing')
    // A real template creates a separate, editable design.
    await second.page.goto(`${stack.urls.web}/app/m/runly.studio/`)
    await second.page.getByRole('button', { name: 'Usar plantilla', exact: true }).first().click()
    await second.page.getByRole('button', { name: 'Texto', exact: true }).waitFor()
    const templateId = new URL(second.page.url()).searchParams.get('design')
    assert.ok((await (await api(`/studio/designs/${templateId}`, token)).json()).data.document.objects.length > 0)
    await second.page.getByRole('button', { name: '3. Texto', exact: true }).click()
    await second.page.getByLabel('Texto del elemento', { exact: true }).fill('Plantilla verificada')
    await second.page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await second.page.getByRole('status').filter({ hasText: /^Guardado$/ }).waitFor()
    assert.ok((await (await api(`/studio/designs/${templateId}`, token)).json()).data.document.objects.some(object => object.text === 'Plantilla verificada'))
    await second.page.screenshot({ path: join(stack.directory, 'studio-real.png'), fullPage: true })
    checks.push('real editable template creation')
    await context.close(); await second.context.close()
    assert.deepEqual(errors, [])
    return { passed: true, auth: 'Supabase GoTrue', storage: 'Supabase Storage file backend', interceptors: 0, checks }
  } catch (error) {
    for (const context of browser.contexts()) for (const page of context.pages()) await page.screenshot({ path: join(stack.directory, 'failure.png'), fullPage: true }).catch(() => {})
    throw error
  } finally { await browser.close() }
}
