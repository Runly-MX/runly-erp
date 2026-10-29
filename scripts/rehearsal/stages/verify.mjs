import assert from 'node:assert/strict'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { collectInventory } from '../lib/inventory.mjs'
import { coverageOf, recoveryCli, recoveryConfig, resticFor } from '../lib/backup-flow.mjs'
import { classifyConfig } from '../lib/recoverable.mjs'
import { compareTrees, containsBytes, hashTree } from '../lib/tree.mjs'
import { locateBackupRoot } from '../../recovery/recovery-assessment.mjs'
import { expect, note, save } from './common.mjs'
import { useSource } from './backup.mjs'

export const sourceInventoryFile = ctx => join(ctx.runDir, 'inventory-source.json')

async function extract(ctx, { key, snapshot, label }) {
  const repo = ctx.state.repos[key]
  const config = await recoveryConfig(ctx, { bucket: repo.bucket, password: repo.password, file: join(ctx.work, `recovery-${key}.env`) })
  const output = join(ctx.runDir, `extract-${label}`)
  await rm(output, { recursive: true, force: true })
  const result = await recoveryCli(ctx, ['extract', '--config', config, '--snapshot', snapshot, '--output', output])
  return { result, output, config }
}

function tableOfContents(listing) {
  const tables = new Set(), data = new Set()
  for (const line of listing.split(/\r?\n/)) {
    let match = /^\d+; \d+ \d+ TABLE DATA (\S+) (\S+) /.exec(line)
    if (match) { data.add(`${match[1]}.${match[2]}`); continue }
    match = /^\d+; \d+ \d+ TABLE (\S+) (\S+) /.exec(line)
    if (match) tables.add(`${match[1]}.${match[2]}`)
  }
  return { tables, data }
}

export async function verifyStage(ctx) {
  const source = await useSource(ctx)
  const A = ctx.state.repos.a, B = ctx.state.repos.b
  const configA = await recoveryConfig(ctx, { bucket: A.bucket, password: A.password, file: join(ctx.work, 'recovery-a.env') })

  // The source inventory is the baseline everything restored is compared with. Taken now, with the source quiet.
  await expect(ctx, 'source-inventory', 'Source inventory taken (tables with content digests, SHA-256 of every Storage object, roles, ACL digest, auth digest)', async () => {
    const inventory = await collectInventory({ pool: source.pool, admin: source.admin })
    await writeFile(sourceInventoryFile(ctx), JSON.stringify(inventory, null, 2), { mode: 0o600 })
    return `${Object.keys(inventory.tables).length} tables, ${Object.keys(inventory.storage.objects).length} objects, ${inventory.roles.length} roles`
  })

  await expect(ctx, 'inspect-classification', 'The recovery CLI lists the snapshots and classifies them: complete, database-only, legacy', async () => {
    const result = await recoveryCli(ctx, ['inspect', '--config', configA])
    if (result.code !== 0) throw Error(`exit ${result.code}: ${result.output.slice(0, 300)}`)
    for (const word of ['complete-declared', 'database-only', 'legacy-unknown']) if (!result.output.includes(word)) throw Error(`classification "${word}" missing from the listing`)
    return result.output.replace(/\s+/g, ' ').slice(0, 260)
  })

  const extracted = await extract(ctx, { key: 'a', snapshot: ctx.state.snapshots.complete, label: 'a' })
  await expect(ctx, 'extract-and-assess', 'The complete snapshot is extracted with the CLI and its assessment reports full coverage (exit 0)', async () => {
    if (extracted.result.code !== 0) throw Error(`extract exit ${extracted.result.code}: ${extracted.result.output.slice(0, 300)}`)
    const assessed = await recoveryCli(ctx, ['assess', '--input', extracted.output])
    if (assessed.code !== 0) throw Error(`assess exit ${assessed.code}: ${assessed.output.slice(0, 400)}`)
    return assessed.output.replace(/\s+/g, ' ').slice(0, 300)
  })
  const root = await locateBackupRoot(extracted.output)
  ctx.state.extractRoot = root
  const manifest = JSON.parse(await readFile(join(root, 'backup-manifest.json'), 'utf8'))

  await expect(ctx, 'manifest-hashes', 'Independent SHA-256 and size of every file listed in the manifest (and no unlisted file)', async () => {
    const actual = await hashTree(root)
    actual.delete('backup-manifest.json')
    const expected = new Map(manifest.files.map(file => [file.path, { size: file.bytes, sha256: file.sha256 }]))
    const comparison = compareTrees(expected, actual)
    if (!comparison.equal) throw Error(`manifest vs files: missing=${comparison.missing.length} extra=${comparison.extra.length} different=${comparison.different.length}`)
    return `${expected.size} files verified`
  })

  await expect(ctx, 'manifest-coverage', 'Manifest: complete coverage for database, Storage, modules and configuration, with the declared consistency level', async () => {
    assert.equal(manifest.coverageMode, 'complete')
    for (const resource of ['database', 'storage', 'modules', 'config']) assert.equal(manifest.resources[resource].status, 'complete', resource)
    assert.equal(manifest.consistency, 'metadata-stable-not-atomic')
    assert.equal(manifest.instanceId, ctx.instanceId)
    assert.equal(manifest.resources.database.dumpMajor >= manifest.resources.database.serverMajor, true)
    const fixture = ctx.state.source.objects
    const objects = manifest.resources.storage.buckets.reduce((sum, bucket) => sum + bucket.objectCount, 0)
    assert.equal(objects, fixture.length, 'object count in the manifest')
    return `format=${manifest.resources.storage.format}, PostgreSQL dump ${manifest.resources.database.dumpMajor} / server ${manifest.resources.database.serverMajor}, ${objects} objects in ${manifest.resources.storage.buckets.length} buckets`
  })

  await expect(ctx, 'storage-bytes', 'Every Storage object in the backup has the exact bytes of the original (SHA-256 from the fixture, not from the manifest)', async () => {
    const tree = await hashTree(join(root, 'storage'))
    for (const object of ctx.state.source.objects) {
      const found = tree.get(`${object.bucket}/${object.name}`)
      if (!found) throw Error(`object missing from the backup: ${object.bucket}/${object.name.slice(-40)}`)
      if (found.sha256 !== object.sha256 || found.size !== object.size) throw Error(`bytes differ: ${object.bucket}/${object.name.slice(-40)}`)
    }
    if (tree.size !== ctx.state.source.objects.length) throw Error(`the backup holds ${tree.size} objects, the source ${ctx.state.source.objects.length}`)
    return `${tree.size} objects identical, including the zero-byte and the 3 MB binary`
  })

  await expect(ctx, 'database-coverage', 'The PostgreSQL dump holds every table of the public, auth and storage schemas, and the data of every table that has rows', async () => {
    const listing = await ctx.log.run('pg_restore --list on the extracted dump', 'docker', ['run', '--rm', '-v', `${root}:/restore:ro`, ctx.backupImage, 'pg_restore', '--list', '/restore/db.dump'])
    const toc = tableOfContents(listing)
    const tables = (await source.pool.query("SELECT table_schema || '.' || table_name AS t FROM information_schema.tables WHERE table_type = 'BASE TABLE' AND table_schema IN ('public', 'auth', 'storage')")).rows.map(row => row.t)
    const missing = tables.filter(table => !toc.tables.has(table))
    const inventory = JSON.parse(await readFile(sourceInventoryFile(ctx), 'utf8'))
    const withRows = Object.entries(inventory.tables).filter(([, value]) => value.rows > 0).map(([name]) => `public.${name}`)
    const noData = withRows.filter(table => !toc.data.has(table))
    if (missing.length || noData.length) throw Error(`missing tables: ${missing.join(',')}; tables with rows but no data section: ${noData.join(',')}`)
    return `${tables.length} tables present; ${withRows.length} public tables with rows all have a data section`
  })

  await expect(ctx, 'modules-tree', 'The installed custom module is in the backup file for file; the transient .staging folder is not', async () => {
    const original = await hashTree(ctx.state.source.modulesDirectory, { skipTopLevel: ['.staging', '.previews', '.locks'] })
    const copied = await hashTree(join(root, 'modules'))
    const comparison = compareTrees(original, copied)
    if (!comparison.equal) throw Error(`modules differ: missing=${comparison.missing} extra=${comparison.extra} different=${comparison.different}`)
    if ([...copied.keys()].some(key => key.startsWith('.staging'))) throw Error('.staging was backed up')
    return `${original.size} module files identical`
  })

  await expect(ctx, 'config-is-redacted', 'The configuration stored in the rehearsal backup is the redacted copy: no secret value of the source appears anywhere in it', async () => {
    const text = await readFile(join(root, 'config', '.env.external'), 'utf8')
    if (classifyConfig(text) !== 'redacted') throw Error(`classified as ${classifyConfig(text)}`)
    const leaked = ctx.state.secrets.filter(secret => secret.length >= 8 && text.includes(secret))
    if (leaked.length) throw Error(`${leaked.length} secret value(s) found in the stored configuration`)
    return 'classification: redacted'
  })

  // Encryption: plaintext must not be recoverable from the repository's files, while the same scan finds it in the decrypted copy.
  await expect(ctx, 'encryption', 'The restic repository is encrypted: wrong password rejected, no plaintext (witness, PDF, PGDMP dump header) in the stored files, same scan finds them in the decrypted copy', async () => {
    const wrong = await resticFor(ctx, { bucket: A.bucket, password: `${A.password}x` }).attempt('restic: open the repository with a wrong password', ['--no-lock', 'snapshots'])
    if (wrong.code === 0) throw Error('a wrong password opened the repository')
    const crossed = await resticFor(ctx, { bucket: A.bucket, password: B.password }).attempt('restic: open repository a with the password of repository b', ['--no-lock', 'snapshots'])
    if (crossed.code === 0) throw Error("repository b's password opened repository a")
    const copy = join(ctx.runDir, 'minio-copy')
    await rm(copy, { recursive: true, force: true }); await mkdir(copy, { recursive: true })
    await ctx.log.run('docker cp: copy the raw MinIO data directory to look for plaintext', 'docker', ['cp', `${ctx.minio.name}:/data/.`, copy])
    const probes = [ctx.state.source.witness, '%PDF-1.4', 'PGDMP']
    const found = {}, control = {}
    for (const probe of probes) {
      found[probe] = (await containsBytes(copy, probe)).length
      control[probe] = (await containsBytes(root, probe)).length
    }
    const leaked = Object.entries(found).filter(([, hits]) => hits > 0).map(([probe]) => probe)
    if (leaked.length) throw Error(`plaintext found in repository files: ${leaked.join(' | ')}`)
    const blind = Object.entries(control).filter(([, hits]) => hits === 0).map(([probe]) => probe)
    if (blind.length) throw Error(`the scan cannot see these probes even in the decrypted copy (control failed): ${blind.join(' | ')}`)
    return `no plaintext in ${probes.length} probes (control: all found in the decrypted copy)`
  })

  // Real recovery needs the original secrets: the integral backup carries them, the rehearsal backup must not.
  await expect(ctx, 'integral-vs-redacted', 'The integral backup carries the original configuration (to be kept outside any replica); the rehearsal backup does not', async () => {
    const integral = await extract(ctx, { key: 'b', snapshot: ctx.state.snapshots.integral, label: 'b' })
    if (integral.result.code !== 0) throw Error(`extract exit ${integral.result.code}: ${integral.result.output.slice(0, 300)}`)
    const text = await readFile(join(await locateBackupRoot(integral.output), 'config', '.env.external'), 'utf8')
    if (classifyConfig(text) !== 'integral') throw Error(`classified as ${classifyConfig(text)}`)
    for (const secret of [ctx.state.source.jwtSecret, ctx.state.synthetic.groq, ctx.state.synthetic.prodRestic]) if (!text.includes(secret)) throw Error('an original secret is missing from the integral configuration')
    // Quarantine: keep the integral configuration in a vault folder, delete the extraction, and make sure the vault is the only place.
    const vault = join(ctx.runDir, 'vault')
    await rm(vault, { recursive: true, force: true }); await mkdir(vault, { recursive: true })
    await writeFile(join(vault, 'integral.env.external'), text, { mode: 0o600 })
    await rm(integral.output, { recursive: true, force: true })
    ctx.state.vault = join(vault, 'integral.env.external')
    return 'integral configuration moved to a vault folder; extraction deleted'
  })
  await ctx.source.pool.end()
  await save(ctx)
}
