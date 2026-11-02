#!/usr/bin/env node
// Idempotent loader of the permanent E2E commerce catalog into ONE existing
// company, through Runly's own API (permissions, audit, stock ledger and
// idempotency keys all apply). It never touches SQL, never deletes, never
// updates a record it did not create (recognised by the E2E-COMMERCE prefix)
// and never lowers stock.
//
//   --status   read-only: what exists, what is missing        (default)
//   --plan     read-only: the exact create/update list
//   --apply    writes; also requires RUNLY_E2E_ALLOW_WRITE=1 and --confirm-company <slug>
//
// Environment (never printed): RUNLY_E2E_API_URL, RUNLY_E2E_COMPANY_ID,
// RUNLY_E2E_EMAIL, RUNLY_E2E_PASSWORD. Options: --out <file> (manifest),
// --expect-slug <slug> (default runly-pruebas-e2e).
import { createHash } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { createRunlyClient } from '../../packages/sdk/src/index.js'
import { CATEGORIES, EXPECTED_COMPANY_SLUG, OUTLETS, PAYMENT_METHODS, PREFIX, PRODUCTS, STATIONS, TABLES, TERMINALS, validateManifest } from './catalog-manifest.mjs'

const argv = process.argv.slice(2)
const flag = (name) => argv.includes(name)
const option = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined)
const mode = flag('--apply') ? 'apply' : flag('--plan') ? 'plan' : 'status'
const expectSlug = option('--expect-slug') ?? EXPECTED_COMPANY_SLUG
const outFile = resolve(option('--out') ?? `.e2e/commerce-e2e-manifest.${mode}.json`)
const fail = (code, message) => { console.error(`${code}: ${message}`); process.exit(code === 'REFUSED' ? 3 : 1) }

const need = ['RUNLY_E2E_API_URL', 'RUNLY_E2E_COMPANY_ID', 'RUNLY_E2E_EMAIL', 'RUNLY_E2E_PASSWORD'].filter((k) => !process.env[k])
if (need.length) fail('CONFIG', `Faltan variables de entorno: ${need.join(', ')}`)
const API = process.env.RUNLY_E2E_API_URL.replace(/\/+$/, '')
const COMPANY = process.env.RUNLY_E2E_COMPANY_ID
const manifestErrors = validateManifest()
if (manifestErrors.length) fail('MANIFEST', manifestErrors.join('; '))
if (mode === 'apply' && (process.env.RUNLY_E2E_ALLOW_WRITE !== '1' || option('--confirm-company') !== expectSlug)) {
  fail('REFUSED', `--apply exige RUNLY_E2E_ALLOW_WRITE=1 y --confirm-company ${expectSlug}`)
}

const sdk = createRunlyClient({ baseUrl: API, getActiveCompanyId: () => COMPANY })
const loginRes = await fetch(`${API}/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ identifier: process.env.RUNLY_E2E_EMAIL, password: process.env.RUNLY_E2E_PASSWORD }) })
const token = (await loginRes.json().catch(() => null))?.data?.access_token
if (!token) fail('LOGIN', `No se pudo iniciar sesión (HTTP ${loginRes.status}).`)
const raw = async (method, path, body) => {
  const res = await fetch(`${API}${path}`, { method, headers: { Authorization: `Bearer ${token}`, 'X-Runly-Company-Id': COMPANY, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) })
  return { status: res.status, body: await res.json().catch(() => null) }
}
const key = (...parts) => `e2e-commerce:${createHash('sha256').update(parts.join('|')).digest('hex').slice(0, 40)}`

// ---- 1. The target must be the E2E company, and the server must be the updated one ---------------------
const profile = await raw('GET', '/company/profile')
const company = profile.body?.data
if (profile.status !== 200 || !company) fail('REFUSED', `No se pudo leer el perfil de la empresa (HTTP ${profile.status}).`)
if (company.companyId !== COMPANY || company.slug !== expectSlug) fail('REFUSED', `La empresa activa (${company.slug}) no es la autorizada (${expectSlug}). No se escribe nada.`)
const context = await raw('GET', '/pos/v2/context')
if (context.status !== 200 || !context.body?.data?.contractVersion || (context.body.data.activation?.phase ?? 0) < 4) fail('REFUSED', 'La instancia no expone el contrato Commerce actualizado (C0 fase 4). Actualiza la instancia antes de cargar.')
const probe = await raw('GET', '/catalog/products?pageSize=1')
const first = probe.body?.data?.[0]
if (probe.status !== 200) fail('REFUSED', `El catálogo no responde (HTTP ${probe.status}).`)
const firstDetail = first ? (await raw('GET', `/catalog/products/${first.id}`)).body?.data : null
if (firstDetail && !Number.isInteger(firstDetail.revision)) fail('REFUSED', 'Los productos no exponen `revision`: faltan las migraciones de integridad de Catálogo. Actualiza la instancia antes de cargar.')
console.log(`Empresa verificada: ${company.slug}. Modo: ${mode}. Instancia con contrato Commerce actualizado.`)

// ---- 2. Discovery (read-only) ------------------------------------------------------------------------
const list = async (path) => { const r = await raw('GET', path); return Array.isArray(r.body?.data) ? r.body.data : Array.isArray(r.body) ? r.body : [] }
const ours = (name) => typeof name === 'string' && name.startsWith(PREFIX)
const existing = {
  settings: (await raw('GET', '/pos/settings')).body?.data ?? null,
  outlets: (await list('/pos/outlets')).filter((o) => ours(o.name)),
  terminals: (await list('/pos/terminals')).filter((t) => ours(t.name)),
  methods: (await list('/pos/payment-methods')).filter((m) => ours(m.name)),
  categories: (await list('/catalog/categories?flat=true')).filter((c) => ours(c.name)),
  products: (await list(`/catalog/products?search=${encodeURIComponent(PREFIX)}&pageSize=500`)).filter((p) => String(p.sku ?? '').startsWith(`${PREFIX}-`)),
}
const foreignOutlets = (await list('/pos/outlets')).filter((o) => !ours(o.name)).length
const outletIdByKey = Object.fromEntries(OUTLETS.map((o) => [o.key, existing.outlets.find((x) => x.name === o.name)?.id]))
existing.stations = []; existing.tables = []
for (const o of OUTLETS) {
  const id = outletIdByKey[o.key]
  if (!id) continue
  existing.stations.push(...(await list(`/pos/stations?outletId=${id}`)).filter((s) => ours(s.name)))
  existing.tables.push(...((await sdk.commerce.tables({ outletId: id }, token).catch(() => ({ data: [] }))).data ?? []).filter((t) => ours(t.name)))
}
const have = {
  outlets: new Set(existing.outlets.map((x) => x.name)), terminals: new Set(existing.terminals.map((x) => x.name)), methods: new Set(existing.methods.map((x) => x.name)),
  categories: new Set(existing.categories.map((x) => x.slug)), products: new Map(existing.products.map((x) => [x.sku, x])),
  stations: new Set(existing.stations.map((x) => x.name)), tables: new Set(existing.tables.map((x) => x.name)),
}
const missing = {
  settings: existing.settings?.currency ? 0 : 1,
  outlets: OUTLETS.filter((x) => !have.outlets.has(x.name)).length, terminals: TERMINALS.filter((x) => !have.terminals.has(x.name)).length,
  stations: STATIONS.filter((x) => !have.stations.has(x.name)).length, methods: PAYMENT_METHODS.filter((x) => !have.methods.has(x.name)).length,
  tables: TABLES.filter((x) => !have.tables.has(x.name)).length, categories: CATEGORIES.filter((x) => !have.categories.has(x.slug)).length,
  products: PRODUCTS.filter((x) => !have.products.has(x.sku)).length,
}
const changed = PRODUCTS.filter((p) => have.products.has(p.sku)).filter((p) => {
  const e = have.products.get(p.sku)
  return e.name !== p.fullName || Number(e.price) !== p.price || (e.barcode ?? null) !== (p.barcode ?? null) || Boolean(e.published) !== p.published
}).length
console.log(JSON.stringify({ alreadyPresent: { outlets: existing.outlets.length, terminals: existing.terminals.length, stations: existing.stations.length, methods: existing.methods.length, tables: existing.tables.length, categories: existing.categories.length, products: existing.products.length }, missing, productsToUpdate: changed, outletsNotOurs: foreignOutlets }))
if (mode !== 'apply') { console.log(mode === 'plan' ? 'Plan calculado; no se escribió nada.' : 'Estado leído; no se escribió nada.'); process.exit(0) }

// ---- 3. Apply -----------------------------------------------------------------------------------------------------
const manifest = { generatedBy: 'scripts/e2e-commerce/load-catalog.mjs', company: { id: company.companyId, slug: company.slug }, createdOrFound: {}, errors: [] }
const record = (kind, k, id, purpose, extra = {}) => { (manifest.createdOrFound[kind] ??= []).push({ key: k, id, purpose, ...extra }) }
let created = 0, updated = 0, errors = 0
const step = async (label, fn) => { try { return await fn() } catch (error) { errors++; manifest.errors.push({ step: label, status: error.status ?? null, code: error.code ?? null, message: String(error.message ?? error).slice(0, 200) }); console.error(`ERROR ${label}: ${error.status ?? ''} ${error.code ?? ''} ${String(error.message ?? error).slice(0, 120)}`); return null } }

// Company-level POS settings only when the company has none.
if (!existing.settings?.currency) {
  await step('settings', async () => { const r = await raw('PATCH', '/pos/settings', { currency: 'MXN', defaultTaxRate: 16, pricesIncludeTax: true, mode: 'HYBRID' }); if (r.status >= 300) throw Object.assign(new Error('settings'), { status: r.status }); created++ })
}
for (const o of OUTLETS) {
  let found = existing.outlets.find((x) => x.name === o.name)
  if (found && found.mode !== o.mode) { console.error(`CONFLICT outlet ${o.name}: existe con otra modalidad (${found.mode}); no se modifica.`); errors++; continue }
  if (!found) found = await step(`outlet ${o.name}`, async () => { const r = await raw('POST', '/pos/outlets', { name: o.name, mode: o.mode, ...(o.kitchenKdsEnabled ? { kitchenKdsEnabled: true } : {}) }); if (r.status >= 300) throw Object.assign(new Error('outlet'), { status: r.status }); created++; return r.body.data })
  if (found) { outletIdByKey[o.key] = found.id; record('outlets', o.key, found.id, o.purpose, { mode: o.mode }) }
}
for (const t of TERMINALS) {
  const outletId = outletIdByKey[t.outlet]; if (!outletId) continue
  let found = existing.terminals.find((x) => x.name === t.name)
  if (!found) found = await step(`terminal ${t.name}`, async () => { const r = await raw('POST', '/pos/terminals', { outletId, name: t.name }); if (r.status >= 300) throw Object.assign(new Error('terminal'), { status: r.status }); created++; return r.body.data })
  if (found) record('terminals', t.name, found.id, 'Caja de pruebas', { outlet: t.outlet })
}
const stationIdByKey = {}
for (const s of STATIONS) {
  const outletId = outletIdByKey[s.outlet]; if (!outletId) continue
  let found = existing.stations.find((x) => x.name === s.name)
  if (!found) found = await step(`station ${s.name}`, async () => { const r = await raw('POST', '/pos/stations', { outletId, name: s.name, code: s.code }); if (r.status >= 300) throw Object.assign(new Error('station'), { status: r.status }); created++; return r.body.data })
  if (found) { stationIdByKey[s.key] = found.id; record('stations', s.key, found.id, 'Estación de Cocina o Barra', { outlet: s.outlet }) }
}
for (const m of PAYMENT_METHODS) {
  let found = existing.methods.find((x) => x.name === m.name)
  if (!found) found = await step(`method ${m.name}`, async () => { const r = await raw('POST', '/pos/payment-methods', { name: m.name, code: m.code, kind: m.kind, ...(m.requiresReference ? { requiresReference: true } : {}) }); if (r.status >= 300) throw Object.assign(new Error('method'), { status: r.status }); created++; return r.body.data })
  if (found) record('paymentMethods', m.code, found.id, m.purpose)
}
for (const t of TABLES) {
  const outletId = outletIdByKey[t.outlet]; if (!outletId) continue
  let found = existing.tables.find((x) => x.name === t.name)
  if (!found) found = await step(`table ${t.name}`, async () => { created++; return (await sdk.commerce.createTable({ outletId, name: t.name, capacity: t.capacity }, token, { idempotencyKey: key('table', t.name) })).data })
  if (found) record('tables', t.name, found.id, 'Mesa sin plano', { outlet: t.outlet })
}
const categoryId = {}
for (const c of CATEGORIES) {
  let found = existing.categories.find((x) => x.slug === c.slug)
  if (!found) found = await step(`category ${c.name}`, async () => { created++; return (await sdk.catalog.createCategory({ name: c.name, slug: c.slug }, token)).data })
  if (found) { categoryId[c.key] = found.id; record('categories', c.key, found.id, 'Categoría comercial') }
}

for (const p of PRODUCTS) {
  let product = have.products.get(p.sku)
  const wasThere = Boolean(product)
  if (!product) {
    product = await step(`product ${p.sku}`, async () => {
      created++
      return (await sdk.catalog.createProduct({ name: p.fullName, slug: p.slug, sku: p.sku, price: p.price, currency: 'MXN', product_type: p.type ?? 'SIMPLE', category_id: categoryId[p.cat], published: p.published,
        ...(p.barcode ? { barcode: p.barcode } : {}), ...(p.tracked ? { track_stock: true, stock: p.stock } : {}) }, token, { idempotencyKey: key('product', p.sku) })).data
    })
    if (!product) continue
  } else {
    const patch = {}
    if (product.name !== p.fullName) patch.name = p.fullName
    if (Number(product.price) !== p.price) patch.price = p.price
    if ((product.barcode ?? null) !== (p.barcode ?? null) && p.barcode) patch.barcode = p.barcode
    if (Boolean(product.published) !== p.published) patch.published = p.published
    if (Object.keys(patch).length) await step(`update ${p.sku}`, async () => {
      const revision = (await raw('GET', `/catalog/products/${product.id}`)).body?.data?.revision
      await sdk.catalog.updateProduct(product.id, { ...patch, expectedVersion: revision }, token, { idempotencyKey: key('update', p.sku, JSON.stringify(patch), revision) }); updated++
    })
  }
  record('products', p.sku, product.id, p.purpose, { existedBefore: wasThere })

  if (p.type === 'VARIABLE' && !wasThere) {
    await step(`option ${p.sku}`, () => sdk.catalog.createOption(product.id, { name: p.option.name, values: p.option.values }, token))
    for (const v of p.variants) {
      await step(`variant ${p.sku}/${v.sku}`, async () => (await sdk.catalog.createVariant(product.id, { option_values: { [p.option.name]: v.value }, sku: `${p.sku}-${v.sku}`, price: v.price, ...(v.barcode ? { barcode: v.barcode } : {}) }, token, { idempotencyKey: key('variant', p.sku, v.sku) })))
    }
  }
  if (!wasThere) {
    if (p.tax) await step(`tax ${p.sku}`, () => sdk.catalogCommerce.setCommercialTax(product.id, p.tax, token, { idempotencyKey: key('tax', p.sku) }))
    if (p.pos === 'none') await step(`availability ${p.sku}`, () => sdk.catalogCommerce.setAvailability(product.id, { enabled: false }, token, { idempotencyKey: key('avail', p.sku, 'none') }))
    else if (Array.isArray(p.pos)) {
      await step(`availability ${p.sku}`, () => sdk.catalogCommerce.setAvailability(product.id, { enabled: false }, token, { idempotencyKey: key('avail', p.sku, 'base') }))
      for (const ok of p.pos) if (outletIdByKey[ok]) await step(`availability ${p.sku}/${ok}`, () => sdk.catalogCommerce.setAvailability(product.id, { outletId: outletIdByKey[ok], enabled: true }, token, { idempotencyKey: key('avail', p.sku, ok) }))
    }
    if (p.prep !== undefined) {
      const stationOf = (outletKey) => stationIdByKey[`${p.prep === 'barra' ? 'barra' : 'cocina'}-${outletKey === 'mixto' ? 'm' : 'r'}`]
      const body = p.prep === false ? { requiresPreparation: false } : { requiresPreparation: true, stationId: stationOf('restaurante') }
      await step(`prep ${p.sku}`, async () => { const r = await raw('PUT', `/pos/products/${product.id}/config`, body); if (r.status >= 300) throw Object.assign(new Error('config'), { status: r.status }) })
    }
    for (const group of p.modifiers ?? []) {
      await step(`modifier ${p.sku}/${group.name}`, async () => {
        const g = await raw('POST', `/pos/products/${product.id}/modifier-groups`, { name: group.name, required: Boolean(group.required), minSelect: group.min, maxSelect: group.max })
        if (g.status >= 300) throw Object.assign(new Error('group'), { status: g.status })
        for (const [i, [name, delta]] of group.options.entries()) {
          const o = await raw('POST', `/pos/modifier-groups/${g.body.data.id}/options`, { name, priceDelta: delta, position: i })
          if (o.status >= 300) throw Object.assign(new Error('option'), { status: o.status })
        }
      })
    }
  }
  // Stock: assign only what is still missing at each outlet; never lower it.
  for (const [ok, target] of Object.entries(p.alloc)) {
    const outletId = outletIdByKey[ok]
    if (!outletId || target <= 0) continue
    await step(`stock ${p.sku}/${ok}`, async () => {
      const balances = (await sdk.catalogCommerce.stockBalances(product.id, { outletId }, token)).data ?? []
      const current = balances.filter((b) => !b.variantId && b.outletId === outletId).reduce((n, b) => n + Number(b.quantity ?? 0), 0)
      if (current >= target) return
      await sdk.catalogCommerce.allocateStock(product.id, { outletId, quantity: target - current, reason: `${PREFIX}: carga de existencias de pruebas` }, token, { idempotencyKey: key('alloc', p.sku, ok, current, target) })
      manifest.createdOrFound.stock = [...(manifest.createdOrFound.stock ?? []), { sku: p.sku, outlet: ok, from: current, to: target }]
    })
  }
}

mkdirSync(dirname(outFile), { recursive: true })
writeFileSync(outFile, JSON.stringify({ ...manifest, summary: { created, updated, errors } }, null, 2))
console.log(JSON.stringify({ created, updated, errors, manifest: outFile.replace(process.cwd(), '.') }))
process.exit(errors ? 1 : 0)
