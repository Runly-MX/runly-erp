export const isEmpty = (value) => value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0)

// `when` is one condition or a list that must all hold. Self-contained: the
// compiler inlines this function into generated modules.
export function matches(when, data, previous = null) {
  if (!when) return true
  if (Array.isArray(when)) return when.every((condition) => matches(condition, data, previous))
  const value = data?.[when.field]
  if (when.op === 'filled') return !isEmpty(value)
  if (when.op === 'changed') return Boolean(previous) && JSON.stringify(previous[when.field] ?? null) !== JSON.stringify(value ?? null)
  if (when.op === 'equals') return String(value ?? '') === String(when.value)
  if (when.op === 'not_equals') return String(value ?? '') !== String(when.value)
  if (when.op === 'contains') return String(value ?? '').toLowerCase().includes(String(when.value ?? '').toLowerCase())
  if (when.op === 'gt') return !isEmpty(value) && Number(value) > Number(when.value)
  if (when.op === 'lt') return !isEmpty(value) && Number(value) < Number(when.value)
  return false
}

export function render(template, data) {
  return String(template).replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => (data?.[key] === undefined || data?.[key] === null ? '' : String(data[key])))
}

export function sourceValue(source, ctx) {
  if (source.from === 'value') return source.value
  if (source.from === 'field') return ctx.data?.[source.field]
  if (source.from === 'template') return render(source.template, ctx.data)
  if (source.from === 'recordId') return ctx.data?.id
  if (source.from === 'actor') return ctx.actorId
  return undefined
}

// Arguments of one step (`ctx.step`, default the first). v1 automations carry
// a single `action` and its `runtime` on the automation itself.
export function buildArgs(automation, ctx) {
  const step = automation.steps?.[ctx.step ?? 0] ?? automation.action
  const runtime = step.runtime ?? automation.runtime
  const args = {}
  for (const [name, source] of Object.entries(step.args)) {
    let value = sourceValue(source, ctx)
    if (isEmpty(value)) continue
    if (runtime.arrayArgs.includes(name) && !Array.isArray(value)) value = [value]
    args[name] = value
  }
  if (runtime.acceptsSource && args.sourceEntityId === undefined && ctx.recordId) args.sourceEntityId = ctx.recordId
  if (ctx.idempotencyKey) args.idempotencyKey = ctx.idempotencyKey
  return args
}

// ---- Execution (shared by generated Builder modules and system automations) ----
// Each function is self-contained or only uses the ones above/below, because the
// compiler inlines them (via toString) into generated modules.

// Keeps a logged value small: anything over `max` characters is stored as text.
export function clip(value, max = 2000) {
  const json = JSON.stringify(value)
  return json && json.length > max ? { truncated: json.slice(0, max) } : value
}

export async function safe(fn, entry) {
  try { return await fn?.(entry) } catch { return null }
}

// Runs the steps of one automation in order, from `from`. Each step gets its own
// idempotency key (<base>, then <base>:<index> from the second step; the first
// keeps the v1 key so republishing never repeats work). With onError "stop"
// (default) the steps after a failure are skipped. A wait or approval step queues
// the continuation and ends this pass: the run stays "waiting" until the worker
// resumes it.
export async function runSteps({ automation, services, base, data, recordId = null, actorId = null, from = 0, enqueue = null, approve = null, http = null, runId = null }) {
  const steps = []
  let failed = false
  let waiting = false
  // Results of earlier service steps (paso<N>_<key>) join the data the next steps can use.
  let scope = data
  // Blocks of the path a condition did not take. A condition splits the flow in two
  // lanes kept flat in the list (the next `yes` blocks, then the next `no` ones).
  const skip = new Set()
  const choose = (step, at) => {
    const taken = matches(step.when, scope) ? 'yes' : 'no'
    const from = at + 1 + (taken === 'yes' ? step.yes : 0)
    const to = taken === 'yes' ? at + 1 + step.yes + step.no : at + 1 + step.yes
    for (let lane = from; lane < to; lane += 1) skip.add(lane)
    return taken
  }
  // After a wait the conditions already crossed are decided again with the saved data.
  for (let at = 0; at < from; at += 1) if (automation.steps[at].type === 'branch') choose(automation.steps[at], at)
  for (let index = from; index < automation.steps.length; index += 1) {
    const step = automation.steps[index]
    const startedAt = Date.now()
    let sent = null
    if (skip.has(index)) { steps.push({ index, service: step.service ?? null, type: step.type ?? null, ok: false, skipped: true, byCondition: true }); continue }
    if (failed && automation.onError !== 'continue') { steps.push({ index, service: step.service ?? null, type: step.type ?? null, ok: false, skipped: true }); continue }
    try {
      if (step.type === 'branch') {
        steps.push({ index, type: 'branch', ok: true, ms: Date.now() - startedAt, path: choose(step, index) })
        continue
      }
      if (step.type === 'delay') {
        if (!enqueue) throw new Error('Las esperas no están disponibles en esta instancia.')
        const runAt = new Date(Date.now() + step.ms).toISOString()
        await enqueue({ automationKey: automation.key, fromStep: index + 1, runAt, runId, payload: { data: scope, recordId, actorId, base }, dedupe: base ? base + ':w' + (index + 1) : null })
        steps.push({ index, type: 'delay', ok: true, waiting: true, runAt })
        waiting = true
        break
      }
      if (step.type === 'approval') {
        if (!approve) throw new Error('Las aprobaciones no están disponibles en esta instancia.')
        await approve({ automationKey: automation.key, fromStep: index + 1, runId, approvers: step.approvers, message: render(step.message, scope), payload: { data: scope, recordId, actorId, base }, dedupe: base ? base + ':a' + (index + 1) : null })
        steps.push({ index, type: 'approval', ok: true, waiting: true, approvers: step.approvers.length })
        waiting = true
        break
      }
      if (step.type === 'http') {
        if (!http) throw new Error('Las llamadas HTTP no están disponibles en esta instancia.')
        const body = {}
        for (const [name, source] of Object.entries(step.body)) {
          const value = sourceValue(source, { data: scope, recordId, actorId })
          if (!isEmpty(value)) body[name] = value
        }
        await http({ method: step.method, url: step.url, body, automationKey: automation.key, idempotencyKey: base ? (index ? base + ':' + index : base) : automation.key + ':' + Date.now() })
        steps.push({ index, type: 'http', ok: true, ms: Date.now() - startedAt, request: clip({ method: step.method, url: step.url, body }, 1000) })
        continue
      }
      const args = buildArgs(automation, { step: index, data: scope, recordId, actorId, idempotencyKey: base ? (index ? base + ':' + index : base) : null })
      sent = args
      const result = await services.call(step.service, args)
      const output = {}
      for (const key of step.outputs ?? []) {
        const value = result?.[key]
        if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) output[key] = value
      }
      scope = { ...scope }
      for (const [key, value] of Object.entries(output)) scope['paso' + (index + 1) + '_' + key] = value
      steps.push({ index, service: step.service, ok: true, ms: Date.now() - startedAt, args: clip(args), output: clip(output, 1000) })
    } catch (error) {
      failed = true
      console.error('[automatizaciones] ' + automation.key + ' paso ' + (index + 1) + ':', error?.message ?? error)
      steps.push({ index, service: step.service ?? null, type: step.type ?? null, ok: false, ms: Date.now() - startedAt, ...(sent ? { args: clip(sent) } : {}), code: error?.code ?? null, error: String(error?.message ?? error) })
    }
  }
  const failures = steps.filter((step) => !step.ok && !step.skipped)
  return { key: automation.key, ok: !failures.length, waiting, steps, code: failures[0]?.code ?? null, error: failures.map((step) => step.error).join(' | ') || null }
}

// One run-log row per execution; logging never breaks the save or the event.
export function runEntry(moduleKey, result, { trigger, ref, startedAt, runId = null, input = null }) {
  const done = result.steps.filter((step) => step.ok).length
  return {
    moduleKey, automationKey: result.key, triggerKind: trigger, triggerRef: ref ?? null, runId, input,
    status: result.ok ? (result.waiting ? 'waiting' : 'success') : (done ? 'partial' : 'failed'),
    steps: result.steps, error: result.error, durationMs: Date.now() - startedAt,
  }
}

// Logs one execution. Automations with waits or approvals open their run row first
// so the continuation can find and finish it.
export async function execute({ moduleKey, automation, services, base, data, recordId, actorId, from = 0, enqueue, approve, http, log, runId = null, trigger, ref }) {
  const startedAt = Date.now()
  let id = runId
  if (!id && automation.steps.some((step) => step.type === 'delay' || step.type === 'approval')) {
    const row = await safe(log, { moduleKey, automationKey: automation.key, triggerKind: trigger, triggerRef: ref ?? null, status: 'running', steps: [], error: null, durationMs: 0, input: clip(data, 4000) })
    id = row?.id ?? null
  }
  const result = await runSteps({ automation, services, base, data, recordId, actorId, from, enqueue, approve, http, runId: id })
  await safe(log, runEntry(moduleKey, result, { trigger, ref, startedAt, runId: id, input: from ? undefined : clip(data, 4000) }))
  return result
}
