import { inventoryCompany, purgeCompanyRows } from './company-deletion-inventory.js'
import { invalidateCache, invalidatePrimaryCache } from './dist-serve-service.js'

export class CompanyDeletionError extends Error {
  constructor(message, status = 409) { super(message); this.status = status }
}

export function createCompanyDeletionService({ prisma, supabaseAdmin, resources = {} }) {
  async function authorize(db, companyId, authUserId) {
    const member = await db.membership.findFirst({
      where: { companyId, enabled: true, user: { authUserId, enabled: true }, role: { enabled: true, key: 'runly.admin' } },
      include: { role: true, company: true },
    })
    if (!member || (member.role.companyId && member.role.companyId !== companyId)) throw new CompanyDeletionError('Solo un administrador de esta empresa puede realizar esta acción.', 403)
    return member
  }

  async function list(authUserId) {
    return prisma.$queryRawUnsafe(`SELECT d.company_id AS "companyId", c.name, d.state, d.purge_after AS "purgeAfter",
      d.requested_at AS "requestedAt", d.state = 'PENDING' AND now() < d.purge_after AS "canRestore"
      FROM runly_lifecycle.company_deletion d JOIN public.company c ON c.id = d.company_id
      JOIN public.membership m ON m.company_id = c.id JOIN public.user_profile u ON u.id = m.user_id
      JOIN public.role r ON r.id = m.role_id
      WHERE u.auth_user_id = $1::uuid AND u.enabled AND m.enabled AND r.enabled AND r.key = 'runly.admin'
      AND (r.company_id IS NULL OR r.company_id = c.id) AND d.state IN ('PENDING','PURGING','FAILED')`, authUserId)
  }

  async function request({ companyId, authUserId, confirmation }) {
    const result = await prisma.$transaction(async db => {
      await db.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext('runly.lifecycle.structure'))")
      await db.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 731))', companyId)
      const member = await authorize(db, companyId, authUserId)
      if (confirmation !== member.company.name) throw new CompanyDeletionError('Escribe el nombre exacto de la empresa.', 422)
      const [existing] = await db.$queryRawUnsafe('SELECT state FROM runly_lifecycle.company_deletion WHERE company_id = $1::uuid FOR UPDATE', companyId)
      if (existing && existing.state !== 'CANCELLED') return { companyId }
      await db.$executeRawUnsafe('SELECT runly_lifecycle.install_guards()')
      await db.$executeRawUnsafe("SELECT set_config('runly.lifecycle_purge', 'on', true)")
      await db.$executeRawUnsafe(`INSERT INTO runly_lifecycle.company_deletion(company_id, requested_by, previous_enabled)
        VALUES ($1::uuid, $2::uuid, $3) ON CONFLICT (company_id) DO UPDATE SET state = 'PENDING',
        requested_by = EXCLUDED.requested_by, requested_at = now(), purge_after = now() + interval '72 hours',
        previous_enabled = EXCLUDED.previous_enabled, updated_at = now(), error_code = NULL, attempts = 0, completed_at = NULL`, companyId, member.userId, member.company.enabled)
      await db.company.update({ where: { id: companyId }, data: { enabled: false } })
      return { companyId }
    }, { timeout: 120_000 })
    invalidateCache(companyId); invalidatePrimaryCache()
    return { ...result, pending: (await list(authUserId)).find(x => x.companyId === companyId) }
  }

  async function cancel({ companyId, authUserId }) {
    await prisma.$transaction(async db => {
      await db.$executeRawUnsafe('SELECT pg_advisory_xact_lock(hashtextextended($1::text, 731))', companyId)
      await authorize(db, companyId, authUserId)
      const [job] = await db.$queryRawUnsafe(`UPDATE runly_lifecycle.company_deletion SET state = 'CANCELLED', updated_at = now()
        WHERE company_id = $1::uuid AND state = 'PENDING' AND purge_after > now() RETURNING previous_enabled`, companyId)
      if (!job) throw new CompanyDeletionError('El plazo de recuperación terminó o la eliminación ya comenzó.')
      await db.$executeRawUnsafe("SELECT set_config('runly.lifecycle_purge', 'on', true)")
      await db.company.update({ where: { id: companyId }, data: { enabled: job.previous_enabled } })
    })
    invalidateCache(companyId); invalidatePrimaryCache()
    return { companyId }
  }

  async function removeObjects(db, companyId) {
      const rows = await db.$queryRawUnsafe(`SELECT bucket, object_key FROM runly_lifecycle.deletion_object
        WHERE company_id = $1::uuid AND NOT removed LIMIT 100`, companyId)
      if (!rows.length) return false
      const buckets = new Map()
      for (const row of rows) buckets.set(row.bucket, [...(buckets.get(row.bucket) ?? []), row.object_key])
      for (const [bucket, keys] of buckets) {
        const { error } = await supabaseAdmin.storage.from(bucket).remove(keys)
        if (error) throw new Error('STORAGE_DELETE_FAILED')
        for (const key of keys) {
          const slash=key.lastIndexOf('/'), prefix=slash<0 ? '' : key.slice(0,slash), name=key.slice(slash+1)
          for (let offset=0; ; offset+=100) {
            const checked=await supabaseAdmin.storage.from(bucket).list(prefix,{search:name,limit:100,offset})
            if (checked.error || !Array.isArray(checked.data) || checked.data.some(object=>object.name===name)) throw new Error('STORAGE_DELETE_FAILED')
            if (checked.data.length<100) break
          }
        }
        await db.$executeRawUnsafe(`UPDATE runly_lifecycle.deletion_object SET removed = true
          WHERE company_id = $1::uuid AND bucket = $2 AND object_key = ANY($3::text[])`, companyId, bucket, keys)
      }
      return true
  }

  async function tick() {
    // Suspension includes already-issued media capabilities. Closing rooms and
    // stopping egress is retried separately from the 72-hour data purge.
    if (resources.stopCaptures) {
      const suspended = await prisma.$queryRawUnsafe("SELECT company_id FROM runly_lifecycle.company_deletion WHERE state='PENDING' AND purge_after>now()")
      for (const row of suspended) {
        try { await resources.stopCaptures({ db: prisma, companyId: row.company_id }) }
        catch { /* Retry next minute; data remains untouched and recoverable. */ }
      }
    }
    const jobs = await prisma.$queryRawUnsafe(`SELECT company_id FROM runly_lifecycle.company_deletion
      WHERE (state = 'PENDING' AND purge_after <= now()) OR state = 'PURGING'
        OR (state = 'FAILED' AND updated_at < now() - interval '5 minutes') ORDER BY purge_after LIMIT 10`)
    const results = []
    for (const { company_id: companyId } of jobs) {
      try {
        const prepared = await prisma.$transaction(async db => {
          const [lock] = await db.$queryRawUnsafe('SELECT pg_try_advisory_xact_lock(hashtextextended($1::text, 731)) AS acquired', companyId)
          if (!lock.acquired) return false
          const [job] = await db.$queryRawUnsafe(`UPDATE runly_lifecycle.company_deletion SET state = 'PURGING', attempts = attempts + 1, updated_at = now(), error_code = NULL
            WHERE company_id = $1::uuid AND state IN ('PENDING','PURGING','FAILED') AND purge_after <= now() RETURNING company_id`, companyId)
          if (!job) return false
          await resources.stopCaptures?.({ db, companyId })
          await inventoryCompany(db, companyId)
          await resources.prepare?.({ db, companyId })
          return true
        }, { timeout: 120_000 })
        if (!prepared) continue
        // Commit each verified Storage batch. A restart or a large tenant must
        // not repeat every preceding batch because one final transaction timed out.
        let storageReady = false
        for (;;) {
          const more = await prisma.$transaction(async db => {
            const [lock] = await db.$queryRawUnsafe('SELECT pg_try_advisory_xact_lock(hashtextextended($1::text, 731)) AS acquired', companyId)
            if (!lock.acquired) return null
            const [job] = await db.$queryRawUnsafe('SELECT state FROM runly_lifecycle.company_deletion WHERE company_id = $1::uuid', companyId)
            if (job?.state !== 'PURGING') return null
            return removeObjects(db, companyId)
          }, { timeout:120_000 })
          if (more === null) break
          if (!more) { storageReady=true; break }
        }
        if (!storageReady) continue
        const completed = await prisma.$transaction(async db => {
          const [lock] = await db.$queryRawUnsafe('SELECT pg_try_advisory_xact_lock(hashtextextended($1::text, 731)) AS acquired', companyId)
          if (!lock.acquired) return false
          const [job] = await db.$queryRawUnsafe('SELECT state FROM runly_lifecycle.company_deletion WHERE company_id = $1::uuid FOR UPDATE', companyId)
          if (job?.state !== 'PURGING') return false
          await db.$executeRawUnsafe("SELECT set_config('runly.lifecycle_purge', 'on', true)")
          const [remaining] = await db.$queryRawUnsafe('SELECT EXISTS(SELECT 1 FROM runly_lifecycle.deletion_object WHERE company_id=$1::uuid AND NOT removed) AS found', companyId)
          if (remaining.found) return false
          await purgeCompanyRows(db, companyId)
          await resources.cleanModules?.({ db, companyId })
          // Keep company/resource-key tombstones for late callbacks and restore
          // protection. Object keys, names and business contents are discarded.
          await db.$executeRawUnsafe('DELETE FROM runly_lifecycle.deletion_object WHERE company_id = $1::uuid', companyId)
          await db.$executeRawUnsafe('DELETE FROM runly_lifecycle.deletion_module WHERE company_id = $1::uuid', companyId)
          await db.$executeRawUnsafe(`UPDATE runly_lifecycle.company_deletion SET state = 'COMPLETED', completed_at = now(), updated_at = now(), error_code = NULL WHERE company_id = $1::uuid`, companyId)
          return true
        }, { timeout: 120_000 })
        if (completed) results.push({ companyId, ok: true })
      } catch (error) {
        // Never persist driver errors: they can contain SQL, paths or values.
        const code = ['STORAGE_DELETE_FAILED','CROSS_COMPANY_REFERENCE','CYCLIC_COMPANY_REFERENCES','UNKEYED_COMPANY_TABLE'].includes(error.message) ? error.message : 'PURGE_FAILED'
        await prisma.$executeRawUnsafe(`UPDATE runly_lifecycle.company_deletion SET state = 'FAILED', error_code = $2, updated_at = now()
          WHERE company_id = $1::uuid AND state NOT IN ('COMPLETED','CANCELLED')`, companyId, code)
        results.push({ companyId, ok: false, code })
      }
    }
    return results
  }

  return { request, cancel, list, tick }
}
