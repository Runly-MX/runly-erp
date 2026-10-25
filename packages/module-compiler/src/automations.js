// Builder automations (definition.automations): a trigger (this module's record
// saved, or a system domain event) plus one module-service call with argument
// mapping. Spec docs/superpowers/specs/2026-10-04-builder-automations-design.md.
// Validated against the shared service contract; the manifest's `consumes` and
// `events.subscribes` are derived from them (never written by hand).
import { DOMAIN_EVENTS, DOMAIN_EVENT_PAYLOADS, SERVICE_CONTRACTS, validateServiceArgs } from '@runly/module-engine/contracts'

export const MAX_AUTOMATIONS = 20
export const AUTOMATION_ARG_SOURCES = Object.freeze(['value', 'field', 'template', 'recordId', 'actor'])
export const RECORD_TRIGGER_ON = Object.freeze(['create', 'update', 'save'])
export const CONDITION_OPS = Object.freeze(['equals', 'not_equals', 'contains', 'gt', 'lt', 'changed', 'filled'])
export const MAX_STEPS = 5
export const MAX_CONDITIONS = 5
export const ON_ERROR = Object.freeze(['stop', 'continue'])
export const DELAY_UNITS = Object.freeze({ minutes: 60_000, hours: 3_600_000, days: 86_400_000 })
export const MAX_DELAY_MS = 30 * 86_400_000
export const MAX_DELAYS = 2
export const SCHEDULE_EVERY = Object.freeze(['hour', 'day', 'week', 'month'])
export const HTTP_METHODS = Object.freeze(['POST', 'PUT', 'PATCH'])
export const MAX_APPROVERS = 5
export const MAX_APPROVALS = 1
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const BODY_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,40}$/
export const MAX_WEBHOOK_FIELDS = 30
export const WEBHOOK_FIELD_KEY = /^[a-zA-Z][a-zA-Z0-9_]{0,60}$/
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/
// Filled in by the runtime, never required from the Builder user.
export const AUTOMATIC_ARGS = Object.freeze(['sourceEntityId', 'idempotencyKey'])

const KEY = /^[a-z][a-z0-9_]{1,40}$/
const UNSAFE_TEXT = /[\r\n`]/
const fieldKey = (field) => field.key ?? field.name
const entityKey = (entity) => entity.key ?? entity.name

function diagnostic(path, code, message) {
  return { path, code, message, severity: 'error' }
}

// v1 definitions carry one `action`; v2 an ordered `steps` list. Everything
// downstream reads steps.
export function stepsOf(automation) {
  if (Array.isArray(automation?.steps)) return automation.steps
  return automation?.action ? [automation.action] : []
}

export const isDelayStep = (step) => step?.type === 'delay'
export const isHttpStep = (step) => step?.type === 'http'
export const isApprovalStep = (step) => step?.type === 'approval'
// Steps that call a module service (everything else is built into the runtime).
export const isServiceStep = (step) => !isDelayStep(step) && !isHttpStep(step) && !isApprovalStep(step)
// Steps that end the current pass and continue later, in the background.
export const isPauseStep = (step) => isDelayStep(step) || isApprovalStep(step)
export const delayMs = (step) => (Number(step?.amount) || 0) * (DELAY_UNITS[step?.unit] ?? 0)

export function conditionsOf(when) {
  if (when === undefined || when === null) return []
  return Array.isArray(when) ? when : [when]
}

// Services an automation can call (writes only); event triggers need system ones.
export function automationServices({ trigger = 'record', afterDelay = false } = {}) {
  return Object.entries(SERVICE_CONTRACTS)
    .filter(([, contract]) => contract.mutates && ((trigger === 'record' && !afterDelay) || contract.system))
    .map(([key, contract]) => ({ key, label: contract.label, args: contract.args, system: Boolean(contract.system) }))
}

// Events a person can pick as a trigger (internal ones stay out).
export const INTERNAL_EVENTS = Object.freeze(['automations.webhook.received'])

export function automationEvents() {
  return Object.entries(DOMAIN_EVENTS).filter(([key]) => !INTERNAL_EVENTS.includes(key)).map(([key, label]) => ({ key, label, payload: [...(DOMAIN_EVENT_PAYLOADS[key] ?? [])] }))
}

// { 'runly.calendar': ['events.create'], ... } from the automations' services.
export function automationConsumes(definition) {
  const consumes = {}
  for (const automation of definition.automations ?? []) {
    for (const step of stepsOf(automation).filter(isServiceStep)) {
      const [owner, name] = String(step?.service ?? '').split(':')
      if (!Object.hasOwn(SERVICE_CONTRACTS, step?.service ?? '')) throw new Error('AUTOMATION_SERVICE_UNKNOWN')
      consumes[owner] ??= []
      if (!consumes[owner].includes(name)) consumes[owner].push(name)
    }
  }
  return consumes
}

export function automationServiceKeys(definition) {
  return [...new Set((definition.automations ?? []).flatMap((automation) => stepsOf(automation).filter(isServiceStep).map((step) => step?.service)).filter(Boolean))]
}

// Schedule triggers the worker has to fire (manifest `schedules`).
export function automationSchedules(definition) {
  return (definition.automations ?? [])
    .filter((automation) => automation?.trigger?.type === 'schedule' && automation.enabled !== false)
    .map((automation) => {
      const { every, at, weekday, day } = automation.trigger
      return { key: automation.key, every, ...(at ? { at } : {}), ...(weekday !== undefined ? { weekday } : {}), ...(day !== undefined ? { day } : {}) }
    })
}

export function automationEventKeys(definition) {
  return [...new Set((definition.automations ?? []).filter((a) => a?.trigger?.type === 'event').map((a) => a.trigger.event))]
}

function validateCondition(when, { base, fieldNames, trigger, errors }) {
  if (when === undefined || when === null) return
  const list = conditionsOf(when)
  const path = `${base}.trigger.when`
  if (list.length > MAX_CONDITIONS) errors.push(diagnostic(path, 'AUTOMATION_CONDITION_INVALID', `At most ${MAX_CONDITIONS} conditions.`))
  list.forEach((condition, index) => {
    const at = Array.isArray(when) ? `${path}[${index}]` : path
    if (!condition || typeof condition !== 'object' || Array.isArray(condition)) { errors.push(diagnostic(at, 'AUTOMATION_CONDITION_INVALID', 'Condition must be an object.')); return }
    if (!fieldNames.has(condition.field)) errors.push(diagnostic(`${at}.field`, 'AUTOMATION_FIELD_NOT_FOUND', `Field "${condition.field}" is not available for this trigger.`))
    if (!CONDITION_OPS.includes(condition.op)) errors.push(diagnostic(`${at}.op`, 'AUTOMATION_CONDITION_INVALID', `Condition must be one of ${CONDITION_OPS.join(', ')}.`))
    if (condition.op === 'changed' && (trigger.type !== 'record' || trigger.on === 'create')) {
      errors.push(diagnostic(`${at}.op`, 'AUTOMATION_CONDITION_INVALID', '"changed" only applies when a record is updated.'))
    }
    if (['equals', 'not_equals'].includes(condition.op) && !['string', 'number', 'boolean'].includes(typeof condition.value)) {
      errors.push(diagnostic(`${at}.value`, 'AUTOMATION_CONDITION_INVALID', `"${condition.op}" needs a text, number or boolean value.`))
    }
    if (condition.op === 'contains' && (typeof condition.value !== 'string' || !condition.value)) {
      errors.push(diagnostic(`${at}.value`, 'AUTOMATION_CONDITION_INVALID', '"contains" needs a text value.'))
    }
    if (['gt', 'lt'].includes(condition.op) && !Number.isFinite(condition.value)) {
      errors.push(diagnostic(`${at}.value`, 'AUTOMATION_CONDITION_INVALID', `"${condition.op}" needs a number.`))
    }
  })
}

// One argument source ({ from: value | field | template | recordId | actor }).
function validateSource(source, { path, fieldNames, trigger, errors, literal }) {
  if (!source || !AUTOMATION_ARG_SOURCES.includes(source.from)) { errors.push(diagnostic(path, 'AUTOMATION_ARG_INVALID', `Source must be one of ${AUTOMATION_ARG_SOURCES.join(', ')}.`)); return }
  if (source.from === 'field' && !fieldNames.has(source.field)) errors.push(diagnostic(path, 'AUTOMATION_FIELD_NOT_FOUND', `Field "${source.field}" is not available for this trigger.`))
  if (source.from === 'template') validateTemplate(source.template, { path, fieldNames, errors, max: 1000, code: 'AUTOMATION_ARG_INVALID' })
  if (source.from === 'actor' && trigger.type !== 'record') errors.push(diagnostic(path, 'AUTOMATION_ARG_INVALID', 'The current user is only known when a record is saved.'))
  if (source.from === 'value') {
    const problem = literal(source.value)
    if (problem) errors.push(diagnostic(path, 'AUTOMATION_ARG_INVALID', `Value: ${problem}.`))
  }
}

function validateTemplate(template, { path, fieldNames, errors, max, code }) {
  if (typeof template !== 'string' || !template.trim() || template.length > max || UNSAFE_TEXT.test(template)) {
    errors.push(diagnostic(path, code, `Template must be a single line of text (max ${max}).`))
    return
  }
  for (const [, ref] of template.matchAll(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g)) {
    if (!fieldNames.has(ref) && ref !== 'id') errors.push(diagnostic(path, 'AUTOMATION_FIELD_NOT_FOUND', `Template field "${ref}" is not available for this trigger.`))
  }
}

function validateArgs(step, { base, fieldNames, trigger, contract, errors }) {
  const args = step?.args === undefined ? {} : step.args
  if (!args || typeof args !== 'object' || Array.isArray(args)) { errors.push(diagnostic(`${base}.args`, 'AUTOMATION_ARGS_INVALID', 'Args must be an object.')); return }
  for (const [name, source] of Object.entries(args)) {
    const path = `${base}.args.${name}`
    if (!Object.hasOwn(contract.args, name) || name === 'idempotencyKey') { errors.push(diagnostic(path, 'AUTOMATION_ARG_UNKNOWN', `The service does not accept "${name}".`)); continue }
    validateSource(source, { path, fieldNames, trigger, errors, literal: (value) => validateServiceArgs(step.service, { [name]: value }).errors[name] ?? null })
  }
  for (const [name, spec] of Object.entries(contract.args)) {
    if (spec.required && !AUTOMATIC_ARGS.includes(name) && !args[name]) {
      errors.push(diagnostic(`${base}.args.${name}`, 'AUTOMATION_ARG_REQUIRED', `"${name}" is required by the service.`))
    }
  }
}

// { type: 'http', method, url, body: { key: source } } (spec stage C, C2).
function validateHttpStep(step, { base, fieldNames, trigger, errors }) {
  if (!HTTP_METHODS.includes(step.method)) errors.push(diagnostic(`${base}.method`, 'AUTOMATION_HTTP_INVALID', `method must be one of ${HTTP_METHODS.join(', ')}.`))
  let url = null
  try { url = new URL(String(step.url ?? '')) } catch { /* reported below */ }
  if (!url || url.protocol !== 'https:' || url.username || url.password || url.port || String(step.url).length > 300 || /[\s{}`]/.test(String(step.url))) {
    errors.push(diagnostic(`${base}.url`, 'AUTOMATION_HTTP_INVALID', 'url must be a fixed https address without credentials or port (max 300).'))
  }
  const body = step.body === undefined ? {} : step.body
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).length > 20) {
    errors.push(diagnostic(`${base}.body`, 'AUTOMATION_HTTP_INVALID', 'body must be an object with at most 20 entries.'))
    return
  }
  const literal = (value) => {
    const json = JSON.stringify(value)
    const simple = (item) => ['string', 'number', 'boolean'].includes(typeof item)
    return json && json.length <= 1000 && (simple(value) || (Array.isArray(value) && value.every(simple))) ? null : 'must be text, number, yes/no or a short list (max 1000)'
  }
  for (const [name, source] of Object.entries(body)) {
    if (!BODY_KEY.test(name)) { errors.push(diagnostic(`${base}.body.${name}`, 'AUTOMATION_HTTP_INVALID', 'Body keys are letters, digits and underscore (max 41).')); continue }
    validateSource(source, { path: `${base}.body.${name}`, fieldNames, trigger, errors, literal })
  }
}

// { type: 'approval', approvers: [profile ids], message } (spec stage C, C3).
function validateApprovalStep(step, { base, fieldNames, errors }) {
  const approvers = step.approvers
  if (!Array.isArray(approvers) || approvers.length < 1 || approvers.length > MAX_APPROVERS || new Set(approvers).size !== approvers.length || !approvers.every((id) => UUID.test(String(id)))) {
    errors.push(diagnostic(`${base}.approvers`, 'AUTOMATION_APPROVAL_INVALID', `Choose 1 to ${MAX_APPROVERS} different people.`))
  }
  validateTemplate(step.message, { path: `${base}.message`, fieldNames, errors, max: 200, code: 'AUTOMATION_APPROVAL_INVALID' })
}

export function validateDefinitionAutomations(definition, errors, { allowWebhook = false } = {}) {
  const list = definition.automations
  if (list === undefined) return
  if (!Array.isArray(list)) { errors.push(diagnostic('automations', 'AUTOMATIONS_INVALID', 'automations must be an array.')); return }
  if (list.length > MAX_AUTOMATIONS) errors.push(diagnostic('automations', 'AUTOMATIONS_LIMIT', `At most ${MAX_AUTOMATIONS} automations.`))
  const entities = new Map((definition.entities ?? []).map((entity) => [entityKey(entity), entity]))
  const keys = new Set()
  list.forEach((automation, index) => {
    const base = `automations[${index}]`
    if (!automation || typeof automation !== 'object') { errors.push(diagnostic(base, 'AUTOMATIONS_INVALID', 'Automation must be an object.')); return }
    if (!KEY.test(automation.key ?? '')) errors.push(diagnostic(`${base}.key`, 'AUTOMATION_KEY_INVALID', 'Key must be lowercase snake_case (2-41 chars).'))
    if (keys.has(automation.key)) errors.push(diagnostic(`${base}.key`, 'AUTOMATION_KEY_DUPLICATE', `Duplicate automation key "${automation.key}".`))
    keys.add(automation.key)
    if (typeof automation.label !== 'string' || !automation.label.trim() || automation.label.length > 120 || UNSAFE_TEXT.test(automation.label)) errors.push(diagnostic(`${base}.label`, 'AUTOMATION_LABEL_INVALID', 'Label is required (one line, max 120).'))
    if (automation.enabled !== undefined && typeof automation.enabled !== 'boolean') errors.push(diagnostic(`${base}.enabled`, 'AUTOMATIONS_INVALID', 'enabled must be boolean.'))

    const trigger = automation.trigger ?? {}
    let fieldNames = new Set()
    if (trigger.type === 'record') {
      const entity = entities.get(trigger.entity)
      if (!entity) errors.push(diagnostic(`${base}.trigger.entity`, 'AUTOMATION_ENTITY_NOT_FOUND', `Entity "${trigger.entity}" does not exist.`))
      else fieldNames = new Set((entity.fields ?? []).map(fieldKey))
      if (!RECORD_TRIGGER_ON.includes(trigger.on)) errors.push(diagnostic(`${base}.trigger.on`, 'AUTOMATION_TRIGGER_INVALID', `on must be one of ${RECORD_TRIGGER_ON.join(', ')}.`))
    } else if (trigger.type === 'event') {
      if (!Object.hasOwn(DOMAIN_EVENTS, trigger.event ?? '')) errors.push(diagnostic(`${base}.trigger.event`, 'AUTOMATION_EVENT_UNKNOWN', `Unknown event "${trigger.event}".`))
      fieldNames = new Set(Object.hasOwn(DOMAIN_EVENT_PAYLOADS, trigger.event ?? '') ? DOMAIN_EVENT_PAYLOADS[trigger.event] : [])
    } else if (trigger.type === 'schedule') {
      if (!SCHEDULE_EVERY.includes(trigger.every)) errors.push(diagnostic(`${base}.trigger.every`, 'AUTOMATION_TRIGGER_INVALID', `every must be one of ${SCHEDULE_EVERY.join(', ')}.`))
      if (trigger.every !== 'hour' && !TIME.test(trigger.at ?? '')) errors.push(diagnostic(`${base}.trigger.at`, 'AUTOMATION_TRIGGER_INVALID', 'at must be a time like "08:00".'))
      if (trigger.every === 'week' && !(Number.isInteger(trigger.weekday) && trigger.weekday >= 0 && trigger.weekday <= 6)) errors.push(diagnostic(`${base}.trigger.weekday`, 'AUTOMATION_TRIGGER_INVALID', 'weekday must be 0 (Sunday) to 6.'))
      if (trigger.every === 'month' && !(Number.isInteger(trigger.day) && trigger.day >= 1 && trigger.day <= 28)) errors.push(diagnostic(`${base}.trigger.day`, 'AUTOMATION_TRIGGER_INVALID', 'day must be 1 to 28.'))
      if (trigger.entity !== undefined) {
        const entity = entities.get(trigger.entity)
        if (!entity) errors.push(diagnostic(`${base}.trigger.entity`, 'AUTOMATION_ENTITY_NOT_FOUND', `Entity "${trigger.entity}" does not exist.`))
        else fieldNames = new Set((entity.fields ?? []).map(fieldKey))
      } else if (trigger.when !== undefined) {
        errors.push(diagnostic(`${base}.trigger.when`, 'AUTOMATION_CONDITION_INVALID', 'Conditions on a schedule need an entity.'))
      }
    } else if (trigger.type === 'webhook' && allowWebhook) {
      const fields = trigger.fields === undefined ? [] : trigger.fields
      if (!Array.isArray(fields) || fields.length > MAX_WEBHOOK_FIELDS) {
        errors.push(diagnostic(`${base}.trigger.fields`, 'AUTOMATION_TRIGGER_INVALID', `fields must be a list of at most ${MAX_WEBHOOK_FIELDS} items.`))
      } else {
        const seen = new Set()
        fields.forEach((field, fieldIndex) => {
          const at = `${base}.trigger.fields[${fieldIndex}]`
          if (!field || !WEBHOOK_FIELD_KEY.test(field.key ?? '')) errors.push(diagnostic(`${at}.key`, 'AUTOMATION_TRIGGER_INVALID', 'Field keys are letters, digits and underscore, starting with a letter (max 61).'))
          else if (seen.has(field.key)) errors.push(diagnostic(`${at}.key`, 'AUTOMATION_TRIGGER_INVALID', `Duplicate field "${field.key}".`))
          else seen.add(field.key)
          if (field?.label !== undefined && (typeof field.label !== 'string' || field.label.length > 80 || UNSAFE_TEXT.test(field.label))) errors.push(diagnostic(`${at}.label`, 'AUTOMATION_TRIGGER_INVALID', 'Field label must be one line (max 80).'))
          if (field?.sample !== undefined && (typeof field.sample !== 'string' || field.sample.length > 200)) errors.push(diagnostic(`${at}.sample`, 'AUTOMATION_TRIGGER_INVALID', 'Field sample must be text (max 200).'))
        })
        fieldNames = new Set(fields.map((field) => field?.key).filter(Boolean))
      }
    } else {
      errors.push(diagnostic(`${base}.trigger.type`, 'AUTOMATION_TRIGGER_INVALID', 'Trigger type must be record, event or schedule.'))
    }
    validateCondition(trigger.when, { base, fieldNames, trigger, errors })

    if (automation.onError !== undefined && !ON_ERROR.includes(automation.onError)) errors.push(diagnostic(`${base}.onError`, 'AUTOMATIONS_INVALID', `onError must be one of ${ON_ERROR.join(', ')}.`))
    if (automation.action !== undefined && automation.steps !== undefined) {
      errors.push(diagnostic(`${base}.steps`, 'AUTOMATION_STEPS_INVALID', 'Use either action or steps, not both.'))
      return
    }
    const usesSteps = automation.steps !== undefined
    if (usesSteps && (!Array.isArray(automation.steps) || !automation.steps.length || automation.steps.length > MAX_STEPS)) {
      errors.push(diagnostic(`${base}.steps`, 'AUTOMATION_STEPS_INVALID', `steps must be a list of 1 to ${MAX_STEPS} actions.`))
      return
    }
    const steps = stepsOf(automation)
    if (!steps.length) { errors.push(diagnostic(`${base}.action`, 'AUTOMATION_SERVICE_UNKNOWN', 'The automation has no action.')); return }
    const delays = steps.filter(isDelayStep)
    if (delays.length > MAX_DELAYS) errors.push(diagnostic(`${base}.steps`, 'AUTOMATION_DELAY_INVALID', `At most ${MAX_DELAYS} waits per automation.`))
    if (steps.filter(isApprovalStep).length > MAX_APPROVALS) errors.push(diagnostic(`${base}.steps`, 'AUTOMATION_APPROVAL_INVALID', `At most ${MAX_APPROVALS} approval per automation.`))
    let afterDelay = false
    steps.forEach((step, stepIndex) => {
      const stepBase = usesSteps ? `${base}.steps[${stepIndex}]` : `${base}.action`
      if (isDelayStep(step)) {
        const ms = delayMs(step)
        if (!Number.isInteger(step.amount) || step.amount < 1 || !Object.hasOwn(DELAY_UNITS, step.unit ?? '') || ms < 60_000 || ms > MAX_DELAY_MS) {
          errors.push(diagnostic(stepBase, 'AUTOMATION_DELAY_INVALID', 'A wait is 1 minute to 30 days (amount + minutes, hours or days).'))
        }
        if (stepIndex === 0 || stepIndex === steps.length - 1 || isPauseStep(steps[stepIndex - 1])) {
          errors.push(diagnostic(stepBase, 'AUTOMATION_DELAY_INVALID', 'A wait goes between two actions.'))
        }
        afterDelay = true
        return
      }
      if (isApprovalStep(step)) {
        validateApprovalStep(step, { base: stepBase, fieldNames, errors })
        if (stepIndex === 0 || stepIndex === steps.length - 1 || isPauseStep(steps[stepIndex - 1])) {
          errors.push(diagnostic(stepBase, 'AUTOMATION_APPROVAL_INVALID', 'An approval goes between two actions.'))
        }
        afterDelay = true
        return
      }
      if (isHttpStep(step)) {
        validateHttpStep(step, { base: stepBase, fieldNames, trigger: afterDelay ? { type: 'event' } : trigger, errors })
        return
      }
      const contract = Object.hasOwn(SERVICE_CONTRACTS, step?.service ?? '') ? SERVICE_CONTRACTS[step.service] : null
      if (!contract) { errors.push(diagnostic(`${stepBase}.service`, 'AUTOMATION_SERVICE_UNKNOWN', `Unknown service "${step?.service}".`)); return }
      if (!contract.mutates) errors.push(diagnostic(`${stepBase}.service`, 'AUTOMATION_SERVICE_READONLY', 'Automations can only call services that create or change records.'))
      if ((trigger.type !== 'record' || afterDelay) && !contract.system) {
        errors.push(diagnostic(`${stepBase}.service`, 'AUTOMATION_SERVICE_NEEDS_USER', `"${contract.label}" needs a person and cannot run ${afterDelay ? 'after a wait' : trigger.type === 'schedule' ? 'on a schedule' : 'from a system event'}.`))
      }
      validateArgs(step, { base: stepBase, fieldNames, trigger, contract, errors })
    })
  })
}

function normalizeStep(step) {
  if (isDelayStep(step)) return { type: 'delay', amount: step.amount, unit: step.unit }
  if (isHttpStep(step)) return { type: 'http', method: step.method, url: step.url, body: step.body ?? {} }
  if (isApprovalStep(step)) return { type: 'approval', approvers: step.approvers, message: step.message.trim() }
  return { service: step.service, args: step.args ?? {} }
}

function normalizeTrigger(trigger, condition) {
  if (trigger.type === 'record') return { type: 'record', entity: trigger.entity, on: trigger.on, ...condition }
  if (trigger.type === 'schedule') {
    return {
      type: 'schedule', every: trigger.every,
      ...(trigger.every !== 'hour' ? { at: trigger.at } : {}),
      ...(trigger.every === 'week' ? { weekday: trigger.weekday } : {}),
      ...(trigger.every === 'month' ? { day: trigger.day } : {}),
      ...(trigger.entity ? { entity: trigger.entity } : {}),
      ...(trigger.entity ? condition : {}),
    }
  }
  if (trigger.type === 'webhook') {
    return {
      type: 'webhook',
      fields: (trigger.fields ?? []).map((field) => ({ key: field.key, ...(field.label ? { label: field.label.trim() } : {}), ...(field.sample ? { sample: field.sample } : {}) })),
      ...condition,
    }
  }
  return { type: 'event', event: trigger.event, ...condition }
}

export function normalizeAutomations(list) {
  return list.map((automation) => {
    const when = automation.trigger.when
    const condition = Array.isArray(when) ? (when.length ? { when: when.length === 1 ? when[0] : when } : {}) : (when ? { when } : {})
    return {
      key: automation.key,
      label: automation.label.trim(),
      enabled: automation.enabled !== false,
      ...(automation.onError === 'continue' ? { onError: 'continue' } : {}),
      trigger: normalizeTrigger(automation.trigger, condition),
      steps: stepsOf(automation).map(normalizeStep),
    }
  })
}

// Steps with what the runtime needs: contract info for service steps, parsed
// durations for waits. v1 `action` definitions are normalized here.
export function toRuntimeSteps(automation) {
  return stepsOf(automation).map((step) => {
    if (isDelayStep(step)) return { type: 'delay', amount: step.amount, unit: step.unit, ms: delayMs(step) }
    if (isHttpStep(step)) return { type: 'http', method: step.method, url: step.url, body: step.body ?? {} }
    if (isApprovalStep(step)) return { type: 'approval', approvers: step.approvers, message: step.message }
    const args = SERVICE_CONTRACTS[step.service]?.args ?? {}
    return {
      service: step.service,
      args: step.args ?? {},
      runtime: {
        arrayArgs: Object.entries(args).filter(([, spec]) => spec.type.endsWith('[]')).map(([name]) => name),
        acceptsSource: Boolean(args.sourceEntityId),
      },
    }
  })
}

// Automations of a company (not tied to a module): triggered by a system event or a
// schedule, never by a record, and without entities. Spec
// docs/superpowers/specs/2026-10-25-system-automations-design.md.
export function validateSystemAutomation(automation) {
  const errors = []
  const type = automation?.trigger?.type
  if (type !== 'event' && type !== 'schedule' && type !== 'webhook') {
    errors.push(diagnostic('automations[0].trigger.type', 'AUTOMATION_TRIGGER_INVALID', 'Automations of the company react to a system event, a webhook or run on a schedule.'))
    return errors
  }
  validateDefinitionAutomations({ entities: [], automations: [automation] }, errors, { allowWebhook: true })
  return errors
}
