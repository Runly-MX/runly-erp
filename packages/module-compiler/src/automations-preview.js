// "Probar" in the Module Builder: what an automation WOULD do for sample data.
// Pure: no service is called and nothing is written. Spec
// docs/superpowers/specs/2026-10-25-automation-studio-v2-stage-c-reach-design.md (C1).
import { SERVICE_CONTRACTS, buildArgs, isEmpty, matches, render, sourceValue, validateServiceArgs } from '@runly/module-engine/contracts'
import { conditionsOf, delayMs, stepsOf, toRuntimeSteps } from './automations.js'

// UUID-shaped stand-ins so id arguments pass the contract checks.
const SAMPLE_ACTOR = '00000000-0000-7000-8000-00000000a001'
const SAMPLE_RECORD = '00000000-0000-7000-8000-00000000a002'

function conditionResults(when, data, previous) {
  return conditionsOf(when).map((condition) => ({
    condition,
    passes: matches(condition, data, previous),
  }))
}

function describeDelay(step) {
  const minutes = delayMs(step) / 60_000
  if (minutes % 1440 === 0) return `${minutes / 1440} día(s)`
  if (minutes % 60 === 0) return `${minutes / 60} hora(s)`
  return `${minutes} minuto(s)`
}

function previewStep(step, rawStep, index, automation, context) {
  if (step.type === 'delay') return { index, kind: 'delay', summary: `Esperar ${describeDelay(rawStep)} antes de continuar` }
  if (step.type === 'approval') {
    return { index, kind: 'approval', summary: `Pedir aprobación a ${step.approvers.length} persona(s)`, message: render(step.message, context.data), approvers: step.approvers }
  }
  if (step.type === 'http') {
    const body = {}
    for (const [name, source] of Object.entries(step.body)) {
      const value = sourceValue(source, context)
      if (!isEmpty(value)) body[name] = value
    }
    return { index, kind: 'http', summary: `${step.method} ${step.url}`, method: step.method, url: step.url, body }
  }
  const contract = SERVICE_CONTRACTS[step.service]
  const args = buildArgs({ ...automation, steps: [step] }, { ...context, step: 0, idempotencyKey: null })
  const checked = contract ? validateServiceArgs(step.service, { ...args, idempotencyKey: 'preview' }) : { errors: { service: 'servicio desconocido' } }
  return {
    index, kind: 'service', summary: contract?.label ?? step.service, service: step.service, args,
    problems: Object.entries(checked.errors ?? {}).map(([name, message]) => `${name}: ${message}`),
  }
}

// automation: a definition item (v1 `action` or v2 `steps`); data: sample record or
// event payload; previous: the record before an update (for "Cambió" conditions).
export function previewAutomation(automation, { data = {}, previous = null } = {}) {
  const conditions = conditionResults(automation?.trigger?.when, data, previous)
  const passes = conditions.every((item) => item.passes)
  const runtimeSteps = toRuntimeSteps(automation)
  const rawSteps = stepsOf(automation)
  const recordId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(data?.id ?? '')) ? data.id : SAMPLE_RECORD
  const context = { data, recordId, actorId: SAMPLE_ACTOR }
  return {
    passes,
    conditions,
    steps: passes ? runtimeSteps.map((step, index) => previewStep(step, rawSteps[index], index, { ...automation, steps: runtimeSteps }, context)) : [],
  }
}
