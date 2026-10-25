// Services of the "work" modules for automations and other modules: create a purchase
// request and look people up in HR. Both are `system: true` (they run in the
// background, company-scoped, with no person). HR only returns what is needed to
// pick someone (name, department, status): never contact, pay or ID data.
import { createPurchasesServices } from '../../routes/purchases/index.js'

export function createWorkHandlers({ prisma, ServiceError, broadcaster = null }) {
  let purchases = null
  const procurement = () => (purchases ??= createPurchasesServices({ prisma, broadcaster, inventoryService: null, supabaseAdmin: null }).procurement)

  return {
    'runly.purchases:requests.create': async ({ companyId }, args) => {
      let created
      try {
        created = await procurement().createRequest(companyId, null, {
          title: args.title,
          justification: args.justification ?? undefined,
          priority: args.priority ?? undefined,
          currency: args.currency ?? undefined,
          neededBy: args.neededBy ?? undefined,
        })
      } catch (error) {
        // Compras explains itself in Spanish (disabled capability, missing title...).
        throw new ServiceError(error?.message ?? 'No se pudo crear la solicitud.', error?.status ?? 400, error?.code ?? 'purchase_request_failed')
      }
      return { id: created.id, number: created.number ?? null, status: created.status }
    },

    'runly.hr:employees.search': async ({ companyId }, args) => {
      const words = String(args.search ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 4)
      const where = {
        companyId, enabled: true,
        ...(args.status ? { status: args.status } : {}),
        ...(words.length ? { AND: words.map((word) => ({ OR: [{ firstName: { contains: word, mode: 'insensitive' } }, { lastName: { contains: word, mode: 'insensitive' } }, { department: { contains: word, mode: 'insensitive' } }] })) } : {}),
      }
      const [rows, total] = await Promise.all([
        prisma.hrEmployee.findMany({ where, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], take: args.limit ?? 20, select: { id: true, firstName: true, lastName: true, department: true, status: true } }),
        prisma.hrEmployee.count({ where }),
      ])
      return { items: rows.map((row) => ({ id: row.id, name: `${row.firstName} ${row.lastName}`.trim(), department: row.department ?? null, status: row.status })), total }
    },
  }
}
