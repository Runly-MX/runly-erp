import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeUploadKey, classifyPathFormat } from '../paths.mjs'
import { parseListingLine, readFilesListing } from '../files-listing.mjs'
import { createFileFetcher } from '../file-fetcher.mjs'
import { parseDumpString } from '../dump-reader.mjs'
import { buildSource, loadSinabe } from '../source.mjs'
import { generateSynthetic } from '../synthetic.mjs'
import { runCensus } from '../census.mjs'

test('normalizes every sinabe path format to one key', () => {
  const key = 'inventories/images/1700-1.jpg'
  for (const raw of ['uploads/inventories/images/1700-1.jpg', '/uploads/inventories/images/1700-1.jpg', 'src\\uploads\\inventories\\images\\1700-1.jpg',
    'https://sinabe.example.com/api/uploads/inventories/images/1700-1.jpg?x=1', '/api/uploads/inventories/images/1700-1.jpg',
    './inventories/images/1700-1.jpg', 'C:\\app\\backend\\src\\uploads\\inventories\\images\\1700-1.jpg']) {
    assert.equal(normalizeUploadKey(raw), key, raw)
  }
  assert.equal(normalizeUploadKey('uploads/a%20b.pdf'), 'a b.pdf')
  assert.equal(normalizeUploadKey('data:image/png;base64,AAAA'), null)
  assert.equal(normalizeUploadKey('uploads/../etc/passwd'), null)
  assert.equal(normalizeUploadKey(''), null)
  assert.equal(classifyPathFormat('src\\uploads\\x'), 'barras-invertidas')
  assert.equal(classifyPathFormat('/uploads/x'), 'barra-uploads')
})

test('parses the operator listing', async () => {
  assert.deepEqual(parseListingLine('1234\t2025-01-02\t./resguardos/r.pdf'), { key: 'resguardos/r.pdf', size: 1234, date: '2025-01-02' })
  assert.equal(parseListingLine('nope').error, 'LISTING_BAD_LINE')
  const dir = mkdtempSync(join(tmpdir(), 'sinabe-listing-'))
  try {
    writeFileSync(join(dir, 'l.tsv'), '10\t2025-01-01\t./a/b.jpg\r\nx\t2025-01-01\t./c\n\n')
    const { files, errors } = await readFilesListing(join(dir, 'l.tsv'))
    assert.equal(files.get('a/b.jpg').size, 10)
    assert.deepEqual(errors, { LISTING_BAD_SIZE: 1 })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('file fetcher: local sha256, traversal guard, http retry once then coded error', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sinabe-fetch-'))
  try {
    mkdirSync(join(dir, 'a'))
    writeFileSync(join(dir, 'a', 'f.txt'), 'hola')
    const local = createFileFetcher({ mode: 'local', dir })
    const got = await local.fetch('a/f.txt')
    assert.equal(got.size, 4)
    assert.equal(got.sha256, 'b221d9dbb083a7f33428d7c2a3c3198ae925614d70210e28716ccaa7cd4ddb79')
    await assert.rejects(local.fetch('a/missing.txt'), { code: 'FILE_NOT_FOUND' })
    await assert.rejects(local.fetch('../x'), { code: 'FILE_BAD_KEY' })

    let calls = 0
    const flaky = createFileFetcher({ mode: 'http', baseUrl: 'https://sinabe.example.com/api/uploads/', fetchImpl: async (url) => {
      calls++
      assert.equal(url, 'https://sinabe.example.com/api/uploads/a/b%20c.jpg')
      return calls === 1 ? new Response('x', { status: 503 }) : new Response('ok')
    } })
    assert.equal((await flaky.fetch('a/b c.jpg')).size, 2)
    assert.equal(flaky.stats.retries, 1)
    const down = createFileFetcher({ mode: 'http', baseUrl: 'https://sinabe.example.com', fetchImpl: async () => new Response('', { status: 500 }) })
    await assert.rejects(down.fetch('a.jpg'), { code: 'FILE_HTTP_ERROR' })

    const capped = createFileFetcher({ mode: 'local', dir, bytesPerSecond: 40 })
    const started = Date.now()
    await capped.fetch('a/f.txt'); await capped.fetch('a/f.txt')
    assert.ok(Date.now() - started >= 90, 'second transfer waits for the bandwidth budget')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('buildSource types values and reports schema drift', () => {
  const sql = "CREATE TABLE `Inventory` (\n  `id` varchar(191),\n  `status` enum('ALTA'),\n  `enabled` tinyint(1),\n  `createdAt` datetime(3),\n  `details` json,\n  `legacy` int\n);\n" +
    "INSERT INTO `Inventory` VALUES ('i1','ALTA',1,'2025-06-01 10:20:30.456','{\\\"a\\\":1}',5),('i2','BAJA',0,'0000-00-00 00:00:00',NULL,6);\n" +
    "CREATE TABLE `_prisma_migrations` (\n  `migration_name` varchar(255),\n  `finished_at` datetime(3),\n  `rolled_back_at` datetime(3)\n);\n" +
    "INSERT INTO `_prisma_migrations` VALUES ('b_two','2025-01-01 00:00:00.000',NULL),('a_one','2025-01-01 00:00:00.000',NULL),('c_bad',NULL,NULL);\n"
  const src = buildSource(parseDumpString(sql))
  assert.equal(src.inventories[0].enabled, true)
  assert.equal(src.inventories[0].createdAt.getTime(), Date.UTC(2025, 5, 1, 10, 20, 30, 456))
  assert.deepEqual(src.inventories[0].details, { a: 1 })
  assert.equal(src.inventories[1].enabled, false)
  assert.equal(src.inventories[1].createdAt, null)
  assert.equal(src.inventories[0].serialNumber, null)
  assert.ok(src.meta.missingColumns.Inventory.includes('serialNumber'))
  assert.deepEqual(src.meta.extraColumns.Inventory, ['legacy'])
  assert.ok(src.meta.missingTables.includes('CustodyRecord'))
  assert.deepEqual(src.meta.appliedMigrations, ['a_one', 'b_two'])
  assert.deepEqual(src.custodyRecords, [])
})

test('synthetic dataset round-trips through loadSinabe and census without leaking identifiers', async () => {
  const out = mkdtempSync(join(tmpdir(), 'sinabe-synth-'))
  try {
    const result = await generateSynthetic({ out, items: 80, seed: 3 })
    const src = await loadSinabe(result.dumpPath)
    assert.equal(src.inventories.length, 80)
    assert.deepEqual(src.meta.missingTables, [])
    assert.deepEqual(src.meta.missingColumns, {})
    assert.equal(src.meta.appliedMigrations.length, 28)
    assert.ok(src.custodyRecords.some((c) => c.receiverSignature?.startsWith('data:image/png;base64,')))
    assert.ok(!('password' in src.users[0]))
    const census = await runCensus({ dump: result.dumpPath, listing: result.listingPath, out: join(out, 'census') })
    assert.equal(census.archivos.listado.referenciadosFaltantes, result.filesMissing)
    assert.equal(census.archivos.listado.huerfanos, result.filesOrphan)
    assert.equal(census.archivos.listado.mayoresDe10MB, 1)
    const report = readFileSync(join(out, 'census', 'census.json'), 'utf8') + readFileSync(join(out, 'census', 'census.md'), 'utf8')
    for (const secret of [src.inventories[0].serialNumber, src.inventories[0].internalFolio, src.users[0].email, src.users[0].firstName, 'base64', '.jpg']) {
      if (secret) assert.ok(!report.includes(secret), 'census must not contain row identifiers')
    }
  } finally { rmSync(out, { recursive: true, force: true }) }
})
