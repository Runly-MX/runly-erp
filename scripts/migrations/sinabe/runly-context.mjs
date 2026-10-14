// Runly side bootstrap for the migrator: Prisma (pg Pool + adapter-pg, like
// apps/api/src/index.js), the Supabase admin client (storage) and the legacy
// import toolkit. Dependencies resolve from apps/api so this works both from
// the repo and inside the API container (/app). Env comes from the API .env
// (`node --env-file=.env ...`); values are never printed.
import { createRequire } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { resolve, dirname } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
export const API_SRC = resolve(HERE, '../../../apps/api/src')
const requireApi = createRequire(resolve(API_SRC, 'index.js'))

export const apiModule = (relative) => import(pathToFileURL(resolve(API_SRC, relative)).href)

export async function createRunlyContext({ source, maxFileBytes, needStorage = true } = {}) {
  const connectionString = process.env.DATABASE_URL ?? process.env.DIRECT_URL
  if (!connectionString) throw new Error('Falta DATABASE_URL (usa node --env-file=.env).')
  const pg = requireApi('pg')
  const { PrismaClient } = requireApi('@prisma/client')
  const { PrismaPg } = requireApi('@prisma/adapter-pg')
  const pool = new pg.Pool({ connectionString, max: 4, min: 0, idleTimeoutMillis: 20_000, connectionTimeoutMillis: 30_000, keepAlive: true })
  pool.on('error', () => { /* pool recovers; never log connection details */ })
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) })
  let supabaseAdmin = null
  if (needStorage) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY.')
    const { createClient } = requireApi('@supabase/supabase-js')
    supabaseAdmin = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  }
  const { createLegacyImportToolkit } = await apiModule('services/legacy-import/index.js')
  const toolkit = createLegacyImportToolkit({ prisma, supabaseAdmin, source, ...(maxFileBytes ? { maxFileBytes } : {}) })
  const { relate } = await apiModule('services/purchases-shared.js')
  const { STORAGE_BUCKET } = await apiModule('services/legacy-import/shared.js')
  const removeObjects = async (keys) => {
    if (!supabaseAdmin || !keys.length) return 0
    let removed = 0
    for (let i = 0; i < keys.length; i += 100) {
      const chunk = keys.slice(i, i + 100)
      const { error } = await supabaseAdmin.storage.from(STORAGE_BUCKET).remove(chunk)
      if (!error) removed += chunk.length
    }
    return removed
  }
  return {
    prisma, supabaseAdmin, toolkit, relate, removeObjects,
    close: async () => { await prisma.$disconnect().catch(() => {}); await pool.end().catch(() => {}) },
  }
}

// Validates the target company and actor (a UserProfile with a membership in it).
export async function assertTarget(prisma, { companyId, actorId }) {
  if (!companyId) throw new Error('--company es obligatorio.')
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } })
  if (!company) throw new Error('La empresa indicada no existe.')
  if (!actorId) return
  const profile = await prisma.userProfile.findUnique({ where: { id: actorId }, select: { id: true } })
  if (!profile) throw new Error('El perfil --actor no existe.')
  const member = await prisma.membership.findFirst({ where: { companyId, userId: actorId }, select: { id: true } }).catch(() => null)
  if (!member) throw new Error('El perfil --actor no pertenece a la empresa.')
}
