// REST facade over the Capability Gateway with the response shape Runly UI's
// RunlyTable / RunlyForm / RunlyDetail already consume ({ data, pagination },
// flat rows). Declarative screens therefore use the shared renderer unchanged:
// the blueprint's apiPath is the entity key and apiBaseUrl is
// /secure-runtime/v1/modules/:key/rest. Every request goes through the same
// gateway call path (token, permissions, quotas, audit); nothing here touches
// storage or trusts a company/user from the request.
import { Hono } from 'hono'
import { GatewayError } from './protocol.js'

const META = new Set(['id', 'version', 'createdAt', 'updatedAt'])
const RESERVED = new Set(['page', 'pageSize', 'search', 'sortBy', 'sortDir'])
export const flatRecord = (r) => ({ id: r.id, ...r.data, version: r.version, createdAt: r.createdAt, updatedAt: r.updatedAt })
const payload = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new GatewayError('INVALID_ARGS', 'Cuerpo inválido.', 422)
  return Object.fromEntries(Object.entries(body).filter(([k]) => !META.has(k)))
}
const num = (value) => (value === undefined || value === '' ? undefined : Number(value))

export function createRestFacade({ guard, moduleFor, invoke, normalize }) {
  const app = new Hono()
  const base = '/secure-runtime/v1/modules/:key/rest/:entity'
  const run = (handler) => async (c) => {
    try { return await handler(c, await moduleFor(c.req.param('key')), c.req.param('entity')) } catch (error) { return normalize(c, error) }
  }
  app.get(base, guard, run(async (c, entry, entity) => {
    const q = c.req.query()
    const filters = Object.fromEntries(Object.entries(q).filter(([k, v]) => !RESERVED.has(k) && v !== ''))
    const args = { entity, page: num(q.page), pageSize: num(q.pageSize), search: q.search || undefined, sortBy: q.sortBy || undefined, sortDir: q.sortDir || undefined, filters: Object.keys(filters).length ? filters : undefined }
    for (const key of Object.keys(args)) if (args[key] === undefined) delete args[key]
    const { data } = await invoke(c, entry, 'records.query', args)
    return c.json({ data: data.items.map(flatRecord), pagination: { page: data.page, pageSize: data.pageSize, total: data.total } })
  }))
  app.get(`${base}/:id`, guard, run(async (c, entry, entity) => c.json({ data: flatRecord((await invoke(c, entry, 'records.get', { entity, id: c.req.param('id') })).data) })))
  app.post(base, guard, run(async (c, entry, entity) => c.json({ data: flatRecord((await invoke(c, entry, 'records.create', { entity, data: payload(await c.req.json().catch(() => null)) })).data) }, 201)))
  app.patch(`${base}/:id`, guard, run(async (c, entry, entity) => {
    const body = await c.req.json().catch(() => null)
    const args = { entity, id: c.req.param('id'), data: payload(body) }
    if (body?.version !== undefined) args.expectedVersion = body.version
    return c.json({ data: flatRecord((await invoke(c, entry, 'records.update', args)).data) })
  }))
  app.delete(`${base}/:id`, guard, run(async (c, entry, entity) => c.json({ data: (await invoke(c, entry, 'records.delete', { entity, id: c.req.param('id') })).data })))
  app.post(`${base}/:id/restore`, guard, run(async (c, entry, entity) => c.json({ data: flatRecord((await invoke(c, entry, 'records.restore', { entity, id: c.req.param('id') })).data) })))
  app.post(`${base}/:id/actions/:action`, guard, run(async (c, entry, entity) => c.json({ data: flatRecord((await invoke(c, entry, 'records.transition', { entity, id: c.req.param('id'), action: c.req.param('action') })).data.record) })))
  return app
}
