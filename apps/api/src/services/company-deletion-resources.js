import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Prisma } from '@prisma/client'
import { connectionObjectNames } from '@runly/module-engine'
import { resolveModulesDir } from './module-upload-service.js'
import { quoteIdentifier } from './company-deletion-inventory.js'

const coreTables = new Set(Prisma.dmmf.datamodel.models.map(m => m.dbName ?? m.name))
const bundleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../bundles')

function childPath(root, name) {
  const base = path.resolve(root), target = path.resolve(base, name)
  if (!target.startsWith(`${base}${path.sep}`)) throw new Error('UNSAFE_MODULE_PATH')
  return target
}

export function createCompanyDeletionResources({ supabaseAdmin, modulesDir = resolveModulesDir, bundlesDir = bundleRoot, env = process.env }) {
  async function capturePrefix(db, companyId, bucket, prefix) {
    if (!prefix || prefix.startsWith('/') || prefix.split('/').some(p => p === '..' || !p)) throw new Error('UNSAFE_STORAGE_PREFIX')
    const storage = supabaseAdmin.storage.from(bucket)
    for (let offset = 0; ; offset += 100) {
      const { data, error } = await storage.list(prefix, { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } })
      if (error && /bucket not found/i.test(error.message ?? '')) return
      if (error || !Array.isArray(data)) throw new Error('STORAGE_INVENTORY_FAILED')
      for (const entry of data) {
        const key = `${prefix}/${entry.name}`
        if (entry.id == null && entry.metadata == null) await capturePrefix(db, companyId, bucket, key)
        else await db.$executeRawUnsafe(`INSERT INTO runly_lifecycle.deletion_object(company_id,bucket,object_key)
          VALUES($1::uuid,$2,$3) ON CONFLICT DO NOTHING`, companyId, bucket, key)
      }
      if (data.length < 100) break
    }
  }

  async function prepare({ db, companyId }) {
    // Persistent ownership proof: an exclusive explicit assignment or Builder
    // project, with no other company assignment/project or dependent module.
    await db.$executeRawUnsafe(`INSERT INTO runly_lifecycle.deletion_module(company_id,module_key)
      SELECT $1::uuid, m.key FROM public.runly_module m WHERE m.key LIKE 'custom.%' AND NOT m.core
      AND (EXISTS(SELECT 1 FROM public.company_module cm WHERE cm.module_id=m.id AND cm.company_id=$1::uuid)
        OR EXISTS(SELECT 1 FROM public.module_builder_project p WHERE p.module_key=m.key AND p.company_id=$1::uuid))
      AND NOT EXISTS(SELECT 1 FROM public.company_module cm WHERE cm.module_id=m.id AND cm.company_id<>$1::uuid)
      AND NOT EXISTS(SELECT 1 FROM public.module_builder_project p WHERE p.module_key=m.key AND p.company_id<>$1::uuid)
      AND NOT EXISTS(SELECT 1 FROM public.module_dependency dep WHERE dep.dependency_id=m.id AND dep.module_id<>m.id)
      ON CONFLICT DO NOTHING`, companyId)
    const [company] = await db.$queryRawUnsafe('SELECT slug FROM public.company WHERE id=$1::uuid', companyId)
    // Include orphan uploads whose metadata insert failed. This is a read of
    // Storage's catalog; physical deletion still exclusively uses Storage API.
    const [storageCatalog] = await db.$queryRawUnsafe("SELECT to_regclass('storage.objects')::text AS name")
    if (storageCatalog.name) await db.$executeRawUnsafe(`INSERT INTO runly_lifecycle.deletion_object(company_id,bucket,object_key)
      SELECT $1::uuid,o.bucket_id,o.name FROM storage.objects o WHERE
      $1::text = ANY(string_to_array(o.name,'/')) OR EXISTS(SELECT 1 FROM runly_lifecycle.deletion_row d
        WHERE d.company_id=$1::uuid AND d.row_key->>'id' = ANY(string_to_array(o.name,'/')))
      ON CONFLICT DO NOTHING`, companyId)
    const sites = await db.$queryRawUnsafe('SELECT id FROM public.website_site WHERE company_id=$1::uuid LIMIT 1', companyId)
    if (sites.length) await capturePrefix(db, companyId, 'runly-website', `dist/${company.slug}`)
    const [notesTable] = await db.$queryRawUnsafe("SELECT to_regclass('public.notes')::text AS name")
    if (notesTable.name) {
      const notes = await db.$queryRawUnsafe('SELECT id FROM public.notes WHERE company_id=$1::uuid', companyId)
      await capturePrefix(db, companyId, 'runly-notes', `companies/${companyId}`)
      // Legacy images are keyed by uploader + note, which can differ from the
      // owner. Match the note UUID; never erase an uploader's personal folder.
      if (notes.length) for (let offset = 0; ; offset += 100) {
        const { data, error } = await supabaseAdmin.storage.from('runly-notes').list('notes', { limit:100, offset })
        if (error && /bucket not found/i.test(error.message ?? '')) break
        if (error || !data) throw new Error('STORAGE_INVENTORY_FAILED')
        for (const user of data) for (const note of notes) await capturePrefix(db, companyId, 'runly-notes', `notes/${user.name}/${note.id}`)
        if (data.length < 100) break
      }
    }
    const recordings = await db.$queryRawUnsafe(`SELECT r.playlist_object_key FROM public.call_recording r
      JOIN public.call c ON c.id=r.call_id JOIN public.chat_conversations conv ON conv.id=c.conversation_id WHERE conv.company_id=$1::uuid AND r.playlist_object_key IS NOT NULL`, companyId)
    for (const row of recordings) await capturePrefix(db, companyId, 'runly-chat', row.playlist_object_key.split('/').slice(0,-1).join('/'))
    const transcripts = await db.$queryRawUnsafe('SELECT DISTINCT conversation_id,call_id FROM public.call_transcript WHERE company_id=$1::uuid', companyId)
    for (const row of transcripts) await capturePrefix(db, companyId, 'runly-chat', `recordings/transcripts/${row.conversation_id}/${row.call_id}`)
  }

  async function stopCaptures({ db, companyId }) {
    const active = await db.$queryRawUnsafe(`SELECT r.egress_id FROM public.call_recording r JOIN public.call c ON c.id=r.call_id
      JOIN public.chat_conversations conv ON conv.id=c.conversation_id WHERE conv.company_id=$1::uuid AND r.status IN ('STARTING','ACTIVE','PROCESSING') AND r.egress_id IS NOT NULL
      UNION SELECT tr.egress_id FROM public.call_transcript_track tr JOIN public.call_transcript t ON t.id=tr.transcript_id
      WHERE t.company_id=$1::uuid AND tr.status IN ('STARTING','ACTIVE','PROCESSING')`, companyId)
    const rooms = await db.$queryRawUnsafe("SELECT c.livekit_room_name AS room_name FROM public.call c JOIN public.chat_conversations conv ON conv.id=c.conversation_id WHERE conv.company_id=$1::uuid AND c.status::text NOT IN ('ENDED','FAILED','CANCELLED')", companyId)
    if (!active.length && !rooms.length) return
    const { EgressClient, RoomServiceClient } = await import('livekit-server-sdk')
    const { readLiveKitConfig } = await import('../routes/calls/call-service.js')
    const config = readLiveKitConfig(env)
    if (!config.internalUrl || !config.apiKey || !config.apiSecret) throw new Error('ACTIVE_CALL_CLEANUP_UNAVAILABLE')
    const egress = new EgressClient(config.internalUrl, config.apiKey, config.apiSecret)
    for (const row of active) {
      const infos = await egress.listEgress({ egressId: row.egress_id })
      for (const info of infos) if (Number(info.status) < 3) await egress.stopEgress(info.egressId)
      // Never inventory storage while a producer can still create objects.
      if (infos.some(info => Number(info.status) < 3)) throw new Error('CAPTURE_STOPPING')
    }
    const roomService = new RoomServiceClient(config.internalUrl, config.apiKey, config.apiSecret)
    const existing = new Set((await roomService.listRooms(rooms.map(r => r.room_name))).map(r => r.name))
    for (const row of rooms) if (existing.has(row.room_name)) await roomService.deleteRoom(row.room_name)
  }

  async function cleanModules({ db, companyId }) {
    const modules = await db.$queryRawUnsafe('SELECT module_key FROM runly_lifecycle.deletion_module WHERE company_id=$1::uuid AND NOT removed', companyId)
    for (const { module_key: key } of modules) {
      if (!/^custom\.[a-z][a-z0-9_]*$/.test(key)) throw new Error('UNSAFE_MODULE_KEY')
      const models = await db.runlyModel.findMany({ where: { moduleKey: key }, select: { tableName: true } })
      const mod = await db.runlyModule.findUnique({ where: { key }, select: { lifecycleConfig: true, manifest: true } })
      const owned = new Set([...models.map(m => m.tableName), ...(mod?.lifecycleConfig?.ownedTables ?? [])])
      for (const table of owned) {
        if (coreTables.has(table) || /^(chat_|note_|notes$|realtime_|runly_|atlas_)/.test(table)) throw new Error('CORE_MODULE_TABLE')
        if (!models.some(m=>m.tableName===table)) throw new Error('UNREGISTERED_MODULE_TABLE')
        quoteIdentifier(table)
      }
      // One DROP accounts for internal dependencies; an external dependency
      // still refuses deletion because we deliberately omit CASCADE.
      if (owned.size) await db.$executeRawUnsafe(`DROP TABLE IF EXISTS ${[...owned].map(t => `public.${quoteIdentifier(t)}`).join(', ')}`)
      for (const connection of mod?.manifest?.connections ?? []) {
        const names = connectionObjectNames(key, connection.key)
        await db.$executeRawUnsafe(`DROP FUNCTION IF EXISTS public.${quoteIdentifier(names.fn)}() CASCADE`)
      }
      const { error } = await supabaseAdmin.storage.from('module-bundles').remove([`${key}.js`])
      if (error) throw new Error('STORAGE_DELETE_FAILED')
      await fs.rm(childPath(bundlesDir, `${key}.js`), { force: true })
      await fs.rm(childPath(await modulesDir(), key), { recursive: true, force: true })
      await db.runlyView.deleteMany({ where: { moduleKey: key } })
      await db.moduleMigration.deleteMany({ where: { moduleKey: key } })
      const backups = await db.moduleSchemaBackup.findMany({ where: { moduleKey: key }, select: { tables: true } })
      for (const backup of backups) for (const entry of backup.tables ?? []) await db.$executeRawUnsafe(`DROP TABLE IF EXISTS runly_backup.${quoteIdentifier(entry.backupTable)}`)
      await db.moduleSchemaBackup.deleteMany({ where: { moduleKey: key } })
      await db.$executeRawUnsafe('DELETE FROM public.module_service_grant WHERE module_key=$1', key)
      await db.$executeRawUnsafe("DELETE FROM public.instance_config WHERE key=$1 OR key LIKE $1 || '.%'", key)
      await db.$executeRawUnsafe('DELETE FROM public.connection_record WHERE module_key=$1', key)
      await db.$executeRawUnsafe('DELETE FROM public.module_connection WHERE module_key=$1', key)
      await db.runlyModel.deleteMany({ where: { moduleKey: key } })
      const permissions = await db.permission.findMany({ where: { module: { key } }, select: { id: true } })
      await db.permission.deleteMany({ where: { id: { in: permissions.map(p => p.id) } } })
      await db.runlyModule.deleteMany({ where: { key } })
      await db.$executeRawUnsafe('UPDATE runly_lifecycle.deletion_module SET removed=true WHERE company_id=$1::uuid AND module_key=$2', companyId, key)
    }
  }
  return { prepare, stopCaptures, cleanModules }
}
