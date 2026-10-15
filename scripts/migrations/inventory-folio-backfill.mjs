// Gives a folio to every inventory item of a company that has none.
//   node --env-file=.env scripts/migrations/inventory-folio-backfill.mjs --company <uuid> [--apply]
// Without --apply it only counts. Prints counts only; never connection details.
import { parseArgs } from 'node:util'
import { apiModule, assertTarget, createRunlyContext } from './sinabe/runly-context.mjs'

const { values } = parseArgs({ options: { company: { type: 'string' }, apply: { type: 'boolean', default: false } } })

const ctx = await createRunlyContext({ source: 'folio-backfill', needStorage: false })
try {
  await assertTarget(ctx.prisma, { companyId: values.company })
  const { backfillFolios } = await apiModule('services/inventory-folio-backfill.js')
  const report = await backfillFolios({ prisma: ctx.prisma, companyId: values.company, apply: values.apply })
  console.log(JSON.stringify(report, null, 2))
  if (!values.apply) console.log('Simulación: agrega --apply para escribir los folios.')
} catch (error) {
  console.error(error?.message ?? error)
  process.exitCode = 1
} finally {
  await ctx.close()
}
