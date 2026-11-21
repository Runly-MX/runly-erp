// apps/api/src/routes/users-routes.js
import { Hono } from 'hono'
import { userSearchQuerySchema } from './ledger/validators.js'
import { getCompanyId, getActorId } from './ledger/service-helpers.js'
import { attachUserAvatarUrls } from '../lib/attach-user-avatars.js'

export function createUsersRouter({ prisma, requirePermission, requireAnyPermission = null, supabaseAdmin = null }) {
  const app = new Hono()

  // Also used by the inventory area members picker (inventory.area.manage) and by
  // Reservaciones and Boletos (team members, staff resources): a space or event admin
  // only holds bookings.access / ticketing.access, so that grant is enough. Always this company's members only.
  const canSearch = requireAnyPermission
    ? requireAnyPermission(['ledger.accounts.read', 'inventory.area.manage', 'bookings.access', 'bookings.spaces.manage', 'bookings.admin', 'ticketing.access', 'ticketing.events.manage', 'ticketing.admin'])
    : requirePermission('ledger.accounts.read')
  app.get('/users/search', canSearch, async (c) => {
    const parsed = userSearchQuerySchema.safeParse(c.req.query())
    if (!parsed.success) {
      return c.json({ error: 'Parametro "q" invalido (min 2 chars cuando se envia).' }, 400)
    }
    const { q, limit, offset, includeSelf } = parsed.data
    const companyId = getCompanyId(c)
    const actorId   = getActorId(c)
    // No "q": default listing (e.g. the "Compartir" picker before the user
    // types anything) — a lower default cap than search mode so this never
    // becomes a de facto "dump the whole company directory" endpoint.
    const effectiveLimit = q ? limit : 20
    const pattern = q ? `%${q}%` : null

    try {
      const rows = await prisma.$queryRaw`
        SELECT DISTINCT p.id, p.display_name, p.email, p.avatar_file_id AS "avatarFileId"
        FROM user_profile p
        INNER JOIN membership m ON m.user_id = p.id AND m.enabled = true
        WHERE m.company_id = ${companyId}::uuid
          AND (${includeSelf}::boolean OR p.id != ${actorId}::uuid)
          AND p.is_bot = false
          AND (
            ${pattern}::text IS NULL
            OR atlas_unaccent(p.display_name) ILIKE atlas_unaccent(${pattern})
            OR atlas_unaccent(p.email) ILIKE atlas_unaccent(${pattern})
          )
        ORDER BY p.display_name, p.id
        LIMIT ${effectiveLimit + 1} OFFSET ${offset}
      `
      // One extra row tells the picker whether "Cargar más" has anything to load.
      const hasMore = rows.length > effectiveLimit
      if (hasMore) rows.length = effectiveLimit
      // Signed thumbnail so pickers can show the profile photo (initials when none).
      await attachUserAvatarUrls(rows, { prisma, supabaseAdmin, variant: 'thumb' })
      return c.json({ data: rows.map(({ avatarFileId, ...row }) => row), hasMore })
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') console.error('[users/search]', err)
      return c.json({ error: 'No se pudo realizar la busqueda.' }, 500)
    }
  })

  return app
}
