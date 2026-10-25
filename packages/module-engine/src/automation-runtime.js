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
